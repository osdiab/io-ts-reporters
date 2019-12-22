import * as t from 'io-ts';

import { reporter } from '../src';

const Gender = t.union([t.literal('Male'), t.literal('Female')]);
const Person = t.interface({
    name: t.string,
    age: t.number,
    gender: Gender,
    // children: t.array(t.recursion('Person', Person)),
    children: t.array(
        t.interface({
            gender: Gender,
        }),
    ),
});
type IPerson = t.TypeOf<typeof Person>;

const logAndReport = (value: t.Validation<{}>) => {
    console.log({
        value,
        reporterResult: reporter(value),
    });
};

const person1: IPerson = {
    name: 'Giulio',
    age: 43,
    gender: 'Male',
    children: [{ gender: 'Female' }],
};
logAndReport(Person.decode(person1));

const person2: {} = {
    name: 'Giulio',
    children: [{ gender: 'Whatever' }],
};
logAndReport(Person.decode(person2));

const NumberGroups = t.array(t.array(t.number));

logAndReport(NumberGroups.decode({}));
logAndReport(NumberGroups.decode([[{}]]));

const Unions = t.interface({
    onOf: t.keyof({ a: null, b: null, c: null }),
    stringUnion: t.union([t.literal('a'), t.literal('b'), t.literal('c')]),
    interfaceUnion: t.union([
        t.interface({ key: t.string }),
        t.interface({ code: t.number }),
    ]),
});
logAndReport(
    Unions.decode({ oneOf: 'A', stringUnion: '', interfaceUnion: {} }),
);
