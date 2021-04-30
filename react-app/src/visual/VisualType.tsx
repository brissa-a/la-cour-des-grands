export interface VisualLayout {
    group(deputes: DeputeApi[]): {
        groupes: [string, DeputeApi[]][]
        maxColSize: number;
    }

    formatGroupeName(groupeName: string): string

    xAxisName(): string | null

    title?(): string | React.ReactElement
}

export type Color = { h: number, s: number, v: number }

export interface VisualColor {
    sort(a: any, b: any): number
    deputeColor(depute: DeputeApi): Color
}

export type VisualProps = {
    y: number,
    x: number,
    h: number,
    s: number,
    v: number
}

export type Visual = {
    Blueprint: React.FC<{}>
    Caption: React.FC<{}>
    deputeWithVisualProp: [DeputeApi, VisualProps][]
}

export type LayoutBuilder = ((visualColor: VisualColor) => (deputes: DeputeApi[]) => Visual)

