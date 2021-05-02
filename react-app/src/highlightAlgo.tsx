import {Fragment} from 'react';
import {sortBy, groupBy} from 'lodash'
import { EditStack, PossibleToken } from './searchAlgo';

type FixLater = any

export function highlightArray(
        metadatas: {token: PossibleToken,result: {word: string,dist: [EditStack, number]};}[],
        fieldName: string,
        color: {h: number,s: number,v: number}
    ) {
    const ungroupedMetadatas = metadatas.filter(m => m.token.fieldName === fieldName)
    if (ungroupedMetadatas.length) {
        const byArrayKey = groupBy(ungroupedMetadatas, m => m.token.arrayKey)
        return Object.values(byArrayKey).map(metadatas => {
            const sliceAndEditStack = metadatas.map((m): [[number, number], EditStack] => [m.token.slice, m.result.dist[0]])
            const originalValue = metadatas[0].token.getField(metadatas[0].token.item as FixLater)
            return highlightMatch(sliceAndEditStack, originalValue, color)
        })
    } else {
        return null
    }
}

export function highlightField(
    metadatas: {token: PossibleToken,result: {word: string,dist: [EditStack, number]};}[],
    fieldName: string,
    color: {h: number,s: number,v: number}
) {
    metadatas = metadatas.filter(m => m.token.fieldName === fieldName)
    if (metadatas.length) {
        const sliceAndEditStack = metadatas.map((m): [[number, number], EditStack] => [m.token.slice, m.result.dist[0]])
        const originalValue = metadatas[0].token.getField(metadatas[0].token.item as FixLater)
        return highlightMatch(sliceAndEditStack, originalValue, color)
    } else {
        return null
    }
}

function highlightMatch(sliceAndEditStack:[[number, number], EditStack][], value: string, color: {h: number,s: number,v: number}) {
    return wrapMatch(sortBy(sliceAndEditStack, saet => {
        const [slice] = saet
        return slice[0]
    }), value, color)
}

const colors = {
    'e': (c: string, {h,s,v}: {h: number,s: number,v: number}) => <span style={{ color: `hsl(${h},${s - 40}%, ${v}%)` }}>{c}</span>,
    'r': (c: string, {h,s,v}: {h: number,s: number,v: number}) => <span>{c}</span>,
    's': (c: string, {h,s,v}: {h: number,s: number,v: number}) => <span>{c}</span>,//style={{ color: `hsl(${(h+180)%360},${s - 40}%, ${v}%)` }}
    'a': (c: string, {h,s,v}: {h: number,s: number,v: number}) => <span>{c}</span>,
    'd': (c: string, {h,s,v}: {h: number,s: number,v: number}) => <span>{c}</span>,
}

function colorize(str: string[], editstack: EditStack, color: {h: number,s: number,v: number}) {
    const [edit, ...remainEdit] = editstack
    const [char, ...remainChar] = str
    if (!edit) return ""
    else if (edit === 'a') return <Fragment>{colors[edit]('', color)}{colorize(str, remainEdit, color)}</Fragment>
    else return <Fragment>{colors[edit](char, color)}{colorize(remainChar, remainEdit, color)}</Fragment>
}

function wrapMatch([head, ...tail]: [[number, number], EditStack][], value: string, color: {h: number,s: number,v: number}, last = 0) {
    if (head) {
        const [[start, end], editstack] = head
        const normal = value.slice(last, start)
        const match = editstack ? colorize([...value.slice(start, end)], editstack, color) : value.slice(start, end)
        const remain = wrapMatch(tail, value, color, end)
        return <Fragment>{normal}{match}{remain}</Fragment>
    } else {
        return value.slice(last)
    }
}