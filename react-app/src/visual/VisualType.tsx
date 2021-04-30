export interface VisualLayout {
    group(deputes: DeputeApi[]) : {
        groupes: [string, DeputeApi[]][]
        maxColSize: number;
    }

    formatGroupeName(groupeName : string) : string

    xAxisName() : string

    title?() : string
}

export type Color = {h:number, s:number, v:number}

export interface VisualColor {
    sort(a:any, b:any) : number
    deputeColor(depute : DeputeApi) : Color
}