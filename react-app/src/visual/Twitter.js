import {Fragment} from 'react';
import sieges from '../sieges.json'

function groupBy(get) {
  return (acc,x) => {
    acc = acc || {}
    const list = acc[get(x)] || []
    acc[get(x)] = [x, ...list]
    return acc
  }
}

class TwitterVisual {

  constructor() {
    const f = s => s.depute?.twitter?.public_metrics?.followers_count || 0
    const followers_counts = sieges.map(s => f(s))
    //const sorted = sieges.sort((a,b) => f(b) - f(a))
    this.global = {
      avg: followers_counts.reduce((acc, x) => acc + x) / sieges.length,
      max: followers_counts.reduce((acc, x) => Math.max(acc, x)),
      //sorted,
    }
    // p < 1 more color for low values
    // p == 1 linéaire
    // p > 1 more color for high values
    //auto determinated to get half the values at 0.5
    const uniquevalues = [...new Set(followers_counts)]
    const weirdmediane = uniquevalues[Math.round(uniquevalues.length/2)]
    this.p = Math.log(0.5)/Math.log(weirdmediane/this.global.max)

    this.f = f
  }

  //Get a number between 0 and 1
  t(twitterFollowerCount) {
    const {global, p} = this
    return (twitterFollowerCount/global.max) ** p
  }

  //reverse t to original value
  tToValue(t) {
    const {global,p} = this
    return t ** (1/(p)) * global.max
  }

  color(t) {
    return {
       h: 203,
       s: t * 88.0,
       v: t * 94.9 * 0.5
     }
   }

   siegeColor(siege) {
     return this.color(this.t(this.f(siege)))
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

     return <Fragment>
       <style>{`
         .twitterblue { stop-color: rgb(46, 138, 196); }
       `}</style>
       <div className="caption"  xmlns="http://www.w3.org/1999/xhtml">
         <svg className="img" width={350} height={400}>
           <defs>
             <linearGradient id="Gradient1" x1="0" x2="0" y1="0" y2="1">
               <stop offset="0%" class="twitterblue"/>
               <stop offset="100%" stop-color="black"/>
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
