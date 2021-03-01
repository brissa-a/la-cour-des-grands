import { groupBy } from '../functional.js';

const { log, ceil, floor} = Math

const params = new URLSearchParams(window.location.search)
const significantFigures = params.has("sf") ? Number.parseInt(params.get("sf")) : 3
const base = params.has("base") ? Number.parseInt(params.get("base")) : 3
const f = d => d.twitter?.public_metrics?.followers_count || 0

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 })

function rangeName({ from, to }) {
  const n = numberFormat.format
  if (from === 0 && to === 0) {
    return `Pas de compte twitter`
  }
  if (from - to === 0) {
    return `${n(from)}`
  }
  return `de\u00a0${n(from)}  à\u00a0${n(to)}`
}

const TwitterVisual = deputes => new class {

  constructor() {
    const followers_counts = deputes.map(d => f(d))
    const max = followers_counts.reduce((acc, x) => Math.max(acc, x))

    const powMax = floor(log(max) / log(base)) - significantFigures + 1
    const sfMax = ceil(max / (base ** powMax))
    const roundedMax = sfMax * base ** powMax

    this.global = {
      base,
      avg: followers_counts.reduce((acc, x) => acc + x) / deputes.length,
      roundedMax, powMax, sfMax
    }
    this.f = f
    window.twitter_visual = this;
  }

  //Get a number between 0 and 1
  t(twitterFollowerCount) {
    if (twitterFollowerCount === 0) return 0
    const { roundedMax } = this.global
    return log(twitterFollowerCount) / log(roundedMax)
  }

  //reverse t to original value
  tToValue(t) {
    const { roundedMax } = this.global
    return roundedMax ** t
  }

  color(t) {
    return {
      h: 203,
      s: t * 70.0,
      v: (t + 0.1) * 94.9 * 0.5
    }
  }

  deputeColor(depute) {
    return this.color(this.t(this.f(depute)))
  }

  sort(sa, sb) {
    return f(sb) - f(sa)
  }

  group(deputes) {
    const { powMax, sfMax, base } = this.global
    const followerGroupsName = [`{"from":${0}, "to":${0}}`, `{"from":${1}, "to":${sfMax}}`]
    const sampleCount = powMax
    for (let i = 0; i < sampleCount; i++) {
      const from = sfMax * base ** i
      const to = sfMax * base ** (i + 1)
      followerGroupsName.push(`{"from":${from}, "to":${to}}`)
    }
    const groupByFollower = groupBy(d => {
      const follower = d.twitter?.public_metrics?.followers_count || 0
      let groupIndex;
      if (follower !== 0) {
        groupIndex = log(follower / sfMax) / log(base)
        groupIndex = groupIndex < 0 ? 0 : ceil(groupIndex)
        groupIndex = groupIndex + 1
      } else {
        groupIndex = 0
      }
      return followerGroupsName[groupIndex]
    })
    const followerGroups = followerGroupsName.reduce(
      (acc, name) => {
        acc[name] = []
        return acc
      },
      {}
    )
    const groupes = Object.entries(deputes
      .reduce(groupByFollower, followerGroups)
    )
    return { groupes, maxColSize: 5 };
  }

  formatGroupeName(groupeName) {
    return rangeName(JSON.parse(groupeName))
  }

  xAxisName() { return "Nombre de follower" }

  caption() {
    const sampleCount = 5
    const [w, h] = [15, 300]

    const samples = [];
    for (let i = 0; i <= (sampleCount - 1); i++) {
      const rate = i / (sampleCount - 1)
      //const value = Math.round(this.tToValue(rate) / 100) * 100
      const value = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 }).format(this.tToValue(rate))
      samples.push(<text x={w + 5} y={h * (1 - rate) + 5} fill="rgba(255, 255, 255, 0.9)" style={{ textAnchor: "start" }}>{value}</text>);
    }

    const stops = [];
    for (let stop = 0; stop <= h; stop++) {
      const c = this.color((h - stop) / h)
      stops.push(<stop offset={stop / h} stop-color={`hsl(${c.h},${c.s}%,${c.v}%)`} />);
    }


    return <foreignObject transform="scale(0.07)" width="110" height="400">
      <div className="undraggable">
        <div className="caption" xmlns="http://www.w3.org/1999/xhtml">
          <svg className="img" width={110} height={325}>
            <defs>
              <linearGradient id="Gradient1" x1="0" x2="0" y1="0" y2="1">
                {stops}
              </linearGradient>
            </defs>
            <g transform="translate(10, 10)">
              <rect x="0" y="0" rx="5" ry="5" width={w} height={h} fill="url(#Gradient1)" />
              {samples}
            </g>
          </svg>
        </div>
      </div>
    </foreignObject >
  }
}

export default TwitterVisual
