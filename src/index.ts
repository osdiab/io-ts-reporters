import * as array from 'fp-ts/lib/Array';
import { fold, mapLeft } from 'fp-ts/lib/Either';
import { groupBy, head, NonEmptyArray, tail } from 'fp-ts/lib/NonEmptyArray';
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
    path: string,
    errors: NonEmptyArray<t.ValidationError>,
) => {
    const { value } = head(errors);

    const expectedTypes = pipe(
        errors,
        error => (console.log(error[0].context), error),
        // TODO: find the errors key key as numeric number (ie. after UnionType)
        // [ type InterfaceType, type UnionType, type X & key 'N' ] -> where N is an int
        array.map(getErrorFromCtx),
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
                  `but instead got: ${jsToString(value)}.`,
          );
};

export const formatValidationError = (path: string, error: t.ValidationError) =>
    pipe(
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

export const format = (
    path: string,
    errors: NonEmptyArray<t.ValidationError>,
) =>
    tail(errors).length > 0
        ? formatUnionError(path, errors)
        : formatValidationError(path, head(errors));

const groupByKey = groupBy((error: t.ValidationError) =>
    error.context.some(isUnionType)
        ? keyPath(error.context.filter(isUnionType))
        : keyPath(error.context),
);

export const reporter = <T>(validation: t.Validation<T>) =>
    pipe(
        validation,
        mapLeft(groupByKey),
        mapLeft(toArray),
        mapLeft(array.map(([path, errors]) => format(path, errors))),
        mapLeft(array.compact),
        fold(
            errors => errors,
            () => [],
        ),
    );
