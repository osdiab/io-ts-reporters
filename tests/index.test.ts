import * as iots from 'io-ts';
import {withMessage} from 'io-ts-types/lib/withMessage';
import * as test from 'tape';

import {reporter} from '../src';

test('reports an empty array when the result doesn’t contain errors', (t) => {
  const PrimitiveType = iots.string;
  const result = PrimitiveType.decode('');

  t.deepEqual(reporter(result), []);
  t.end();
});

test('formats a top-level primitve type correctly', (t) => {
  const PrimitiveType = iots.string;
  const result = PrimitiveType.decode(42);

  t.deepEqual(reporter(result), ['Expecting string but instead got: 42']);
  t.end();
});

test('formats array items', (t) => {
  const NumberGroups = iots.array(iots.array(iots.number));
  const result = NumberGroups.decode({});

  t.deepEqual(reporter(result), [
    'Expecting Array<Array<number>> but instead got: {}'
  ]);
  t.end();
});

test('formats nested array item mismatches correctly', (t) => {
  const NumberGroups = iots.array(iots.array(iots.number));
  const result = NumberGroups.decode([[{}]]);

  t.deepEqual(reporter(result), [
    'Expecting number at 0.0 but instead got: {}'
  ]);
  t.end();
});

test('formats a complex type correctly', (t) => {
  const Gender = iots.union([iots.literal('Male'), iots.literal('Female')]);
  const Person = iots.interface({
    name: iots.string,
    age: iots.number,
    gender: Gender,
    children: iots.array(
      iots.interface({
        gender: Gender
      })
    )
  });
  const result = Person.decode({
    name: 'Giulio',
    children: [{gender: 'Whatever'}]
  });

  t.deepEqual(reporter(result), [
    'Expecting number at age but instead got: undefined.',
    `Expecting one of:
    "Male"
    "Female"
    "Male"
    "Female"
at gender but instead got: undefined.`
  ]);
  t.end();
});

test('handles union types properly', (t) => {
  const Unions = iots.interface({
    oneOf: iots.keyof({a: null, b: null, c: null}),
    stringUnion: iots.union([
      iots.literal('a'),
      iots.literal('b'),
      iots.literal('c')
    ]),
    interfaceUnion: iots.union([
      iots.interface({key: iots.string}),
      iots.interface({code: iots.number})
    ])
  });

  t.deepEqual(
    reporter(
      Unions.decode({
        oneOf: '',
        stringUnion: '',
        interfaceUnion: ''
      })
    ),
    [
      `Expecting one of:
    { key: string }
    { code: number }
at interfaceUnion but instead got: "".`,
      'Expecting "a" | "b" | "c" at oneOf but instead got: "".',
      `Expecting one of:
    "a"
    "b"
    "c"
at stringUnion but instead got: "".`
    ]
  );

  t.deepEqual(
    reporter(
      Unions.decode({
        oneOf: 'a',
        stringUnion: 'a',
        interfaceUnion: {}
      })
    ),
    [
      `Expecting one of:
    { key: string }
    { code: number }
at interfaceUnion but instead got: {}.`
    ]
  );

  t.end();
});

test('formats branded types correctly', (t) => {
  interface PositiveBrand {
    readonly Positive: unique symbol;
  }

  const Positive = iots.brand(
    iots.number,
    (n): n is iots.Branded<number, PositiveBrand> => n >= 0,
    'Positive'
  );

  t.deepEqual(reporter(Positive.decode(-1)), [
    'Expecting Positive but instead got: -1'
  ]);

  const PatronizingPositive = withMessage(
    Positive,
    (_i) => `Don't be so negative!`
  );

  t.deepEqual(reporter(PatronizingPositive.decode(-1)), [
    'Expecting Positive but instead got: -1 (message: "Don\'t be so negative!")'
  ]);

  t.end();
});
