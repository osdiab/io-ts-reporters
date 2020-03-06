import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import { flow } from 'fp-ts/lib/function';
import * as NEA from 'fp-ts/lib/NonEmptyArray';
import * as O from 'fp-ts/lib/Option';
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
const getErrorFromCtx = (validation: t.ValidationError) =>
    // https://github.com/gcanti/fp-ts/pull/544/files
    A.last(validation.context as Array<t.ContextEntry>);

const getValidationContext = (validation: t.ValidationError) =>
    // https://github.com/gcanti/fp-ts/pull/544/files
    validation.context as Array<t.ContextEntry>;

const expectedTypesToString = flow(
    A.map(({ type }: t.ContextEntry) => `    ${type.name}`),
    arr => arr.join('\n'),
);

export const formatUnionError = (
    path: string,
    errors: NEA.NonEmptyArray<t.ValidationError>,
) => {
    const expectedTypes = pipe(
        errors,
        A.map(getValidationContext),
        A.map(ctx =>
            pipe(
                ctx,
                // find the union type in the list of ContextEntry
                A.findIndex(isUnionType),
                // the next ContextEntry should be the
                // type of this branch of the union
                O.chain(n => A.lookup(n + 1, ctx)),
            ),
        ),
        A.compact,
    );

    const value = pipe(
        expectedTypes,
        A.head,
        O.map(v => v.actual),
        O.getOrElse<unknown>(() => undefined),
    );

    const expected = expectedTypesToString(expectedTypes);

    return expected.trim() === ''
        ? O.none
        : O.some(
              // https://github.com/elm-lang/core/blob/18c9e84e975ed22649888bfad15d1efdb0128ab2/src/Native/Json.js#L199
              // tslint:disable-next-line:prefer-template
              `Expecting one of:\n${expected}` +
                  (path === '' ? '\n' : `\nat ${path} `) +
                  `but instead got: ${jsToString(value)}.`,
          );
};

export const formatValidationError = (path: string, error: t.ValidationError) =>
    pipe(
        error,
        getErrorFromCtx,
        O.map(errorContext => {
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
    errors: NEA.NonEmptyArray<t.ValidationError>,
) =>
    NEA.tail(errors).length > 0
        ? formatUnionError(path, errors)
        : formatValidationError(path, NEA.head(errors));

const groupByKey = NEA.groupBy((error: t.ValidationError) =>
    error.context.some(isUnionType)
        ? keyPath(error.context.filter(isUnionType))
        : keyPath(error.context),
);

export const reporter = <T>(validation: t.Validation<T>) =>
    pipe(
        validation,
        E.mapLeft(groupByKey),
        E.mapLeft(toArray),
        E.mapLeft(A.map(([path, errors]) => format(path, errors))),
        E.mapLeft(A.compact),
        E.fold(
            errors => errors,
            () => [],
        ),
    );
