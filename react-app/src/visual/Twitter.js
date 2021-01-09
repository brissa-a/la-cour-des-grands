import {Fragment} from 'react';
import sieges from '../sieges.json'
import Chart from '../chart/TwitterChart.js'
const {log, ceil, floor, round} = Math

function groupBy(get) {
  return (acc,x) => {
    acc = acc || {}
    const list = acc[get(x)] || []
    acc[get(x)] = [x, ...list]
    return acc
  }
}

const params = new URLSearchParams(window.location.search)
const significantFigures = params.has("sf") ? Number.parseInt(params.get("sf")) : 3
const base = params.has("sf") ? Number.parseInt(params.get("base")) : 3

class TwitterVisual {

  constructor() {
    const f = s => s.depute?.twitter?.public_metrics?.followers_count || 0
    const followers_counts = sieges.map(s => f(s))
    const max = followers_counts.reduce((acc, x) => Math.max(acc, x))

    const powMax = floor(log(max)/log(base)) - significantFigures + 1
    const sfMax = ceil(max/(base**powMax))
    const roundedMax = sfMax * base ** powMax

    this.global = {
      base,
      avg: followers_counts.reduce((acc, x) => acc + x) / sieges.length,
      roundedMax, powMax, sfMax
    }
    this.f = f
    window.twitter_visual = this;
  }

  //Get a number between 0 and 1
  t(twitterFollowerCount) {
    if (twitterFollowerCount == 0) return 0
    const {roundedMax} = this.global
    return log(twitterFollowerCount)/log(roundedMax)
  }

  //reverse t to original value
  tToValue(t) {
    const {roundedMax} = this.global
    return roundedMax ** t
  }

  color(t) {
    return {
       h: 203,
       s: t * 70.0,
       v: (t + 0.1) * 94.9 * 0.5
     }
   }

   siegeColor(siege) {
     return this.color(this.t(this.f(siege)))
   }

   chart(props) {
     return <Chart app={props.app} visual={this} color={this.color}/>
   }

   caption() {
     const txt = 14
     const sampleCount = 5
     const [w,h] = [15, 300]

     const samples = [];
     for (let i = 0; i <= (sampleCount - 1); i++) {
       const rate = i/(sampleCount - 1)
       //const value = Math.round(this.tToValue(rate) / 100) * 100
       const value = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 }).format(this.tToValue(rate))
       samples.push(<text x={w + 5} y={h * (1-rate) + 5} fill="rgba(255, 255, 255, 0.9)">{value}</text>);
     }

     const stops = [];
     for (let stop = 0; stop <= h; stop++) {
       const c = this.color((h-stop)/h)
       stops.push(<stop offset={stop/h} stop-color={`hsl(${c.h},${c.s}%,${c.v}%)`}/>);
     }


     return <Fragment>
       <div className="caption"  xmlns="http://www.w3.org/1999/xhtml">
         <svg className="img" width={350} height={400}>
           <defs>
             <linearGradient id="Gradient1" x1="0" x2="0" y1="0" y2="1">
               {stops}
             </linearGradient>
           </defs>
           <g transform="translate(10, 10)">
           <rect x="0" y="0" rx="5" ry="5" width={w} height={h} fill="url(#Gradient1)"/>
           {samples}
           </g>
         </svg>
       </div>
     </Fragment>
   }
}

export default new TwitterVisual()
