import * as array from 'fp-ts/lib/Array';
import { fold, mapLeft } from 'fp-ts/lib/Either';
import * as NEA from 'fp-ts/lib/NonEmptyArray';
import { map, none, some } from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/pipeable';
import { toArray } from 'fp-ts/lib/Record';
import * as t from 'io-ts';

const isUnionType = ({ type }: t.ContextEntry) => type instanceof t.UnionType;

const jsToString = (value: t.mixed) =>
    value === undefined ? 'undefined' : JSON.stringify(value);

const keyPath = (ctx: t.Context) =>
    ctx
        .map(c => c.key)
        // The context entry with an empty key is the original
        // type ("default context"), not an type error.
        .filter(key => key.length > 0)
        .join('.');

// The actual error is last in context
const getErrorFromCtx = ({ context }: t.ValidationError) =>
    // https://github.com/gcanti/fp-ts/pull/544/files
    array.last(context as Array<t.ContextEntry>);

export const formatUnionError = (
    errors: NEA.NonEmptyArray<t.ValidationError>,
) => {
    const error = NEA.head(errors);
    const path = keyPath(error.context.filter(isUnionType));

    const expectedTypes = pipe(
        errors,
        NEA.map(getErrorFromCtx),
        arr => [NEA.head(arr), ...NEA.tail(arr)],
        array.compact,
        array.map(({ type }) => `    ${type.name}`),
        arr => arr.join('\n'),
    );

    return expectedTypes.trim() === ''
        ? none
        : some(
              // https://github.com/elm-lang/core/blob/18c9e84e975ed22649888bfad15d1efdb0128ab2/src/Native/Json.js#L199
              // tslint:disable-next-line:prefer-template
              `Expecting one of:\n${expectedTypes}` +
                  (path === '' ? '\n' : `\nat ${path} `) +
                  `but instead got: ${jsToString(error.value)}.`,
          );
};

export const formatValidationError = (error: t.ValidationError) => {
    const path = keyPath(error.context);

    return pipe(
        error,
        getErrorFromCtx,
        map(errorContext => {
            const expectedType = errorContext.type.name;

            return (
                // https://github.com/elm-lang/core/blob/18c9e84e975ed22649888bfad15d1efdb0128ab2/src/Native/Json.js#L199
                // tslint:disable-next-line:prefer-template
                `Expecting ${expectedType}` +
                (path === '' ? '' : ` at ${path}`) +
                ` but instead got: ${jsToString(error.value)}.`
            );
        }),
    );
};

export const format = (errors: NEA.NonEmptyArray<t.ValidationError>) =>
    NEA.tail(errors).length > 0
        ? formatUnionError(errors)
        : formatValidationError(NEA.head(errors));

const groupByKey = NEA.groupBy((error: t.ValidationError) =>
    error.context.some(isUnionType)
        ? keyPath(error.context.filter(isUnionType))
        : keyPath(error.context),
);

export const reporter = <T>(validation: t.Validation<T>) =>
    pipe(
        validation,
        mapLeft(groupByKey),
        mapLeft(toArray),
        mapLeft(array.map(([_key, errors]) => format(errors))),
        mapLeft(array.compact),
        fold(
            errors => errors,
            () => [],
        ),
    );
