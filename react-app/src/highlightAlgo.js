import {Fragment} from 'react';
import {sortBy, groupBy} from 'lodash'

export function highlightArray(metadatas, fieldName, color) {
    const ungroupedMetadatas = metadatas.filter(m => m.token.fieldName === fieldName)
    if (ungroupedMetadatas.length) {
        const byArrayKey = groupBy(ungroupedMetadatas, m => m.token.arrayKey)
        return Object.values(byArrayKey).map(metadatas => {
            const sliceAndEditStack = metadatas.map(m => [m.token.slice, m.result.dist[0]])
            const originalValue = metadatas[0].token.getField(metadatas[0].token.item)
            return highlightMatch(sliceAndEditStack, originalValue, color)
        })
    } else {
        return null
    }
}

export function highlightField(metadatas, fieldName, color) {
    metadatas = metadatas.filter(m => m.token.fieldName === fieldName)
    if (metadatas.length) {
        const sliceAndEditStack = metadatas.map(m => [m.token.slice, m.result.dist[0]])
        const originalValue = metadatas[0].token.getField(metadatas[0].token.item)
        return highlightMatch(sliceAndEditStack, originalValue, color)
    } else {
        return null
    }
}

function highlightMatch(sliceAndEditStack, value, color) {
    return wrapMatch(sortBy(sliceAndEditStack, saet => {
        const [slice, editstack] = saet
        return slice[0]
    }), value, color)
}

const colors = {
    'e': (c, {h,s,v}) => <span style={{ color: `hsl(${h},${s - 40}%, ${v}%)` }}>{c}</span>,
    'r': (c, {h,s,v}) => <span>{c}</span>,
    's': (c, {h,s,v}) => <span>{c}</span>,//style={{ color: `hsl(${(h+180)%360},${s - 40}%, ${v}%)` }}
    'a': (c, {h,s,v}) => <span>{c}</span>,
    'd': (c, {h,s,v}) => <span>{c}</span>,
}

function colorize(str, editstack, color) {
    const [edit, ...remainEdit] = editstack
    const [char, ...remainChar] = str
    if (!edit) return ""
    else if (edit === 'a') return <Fragment>{colors[edit]('', color)}{colorize(str, remainEdit, color)}</Fragment>
    else return <Fragment>{colors[edit](char, color)}{colorize(remainChar, remainEdit, color)}</Fragment>
}

function wrapMatch([head, ...tail], value, color, last = 0) {
    if (head) {
        const [[start, end], editstack] = head
        const normal = value.slice(last, start)
        const match = editstack ? colorize(value.slice(start, end), editstack, color) : value.slice(start, end)
        const remain = wrapMatch(tail, value, color, end)
        return <Fragment>{normal}{match}{remain}</Fragment>
    } else {
        return value.slice(last)
    }
}