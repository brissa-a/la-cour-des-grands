import {Fragment} from 'react';
import sieges from '../sieges.json'

const youngColor = {
  h: 31,
  s: 23.0,
  v: 150 * 0.5
}
const oldColor = {
  h: 31,
  s: 88,
  v: 30 * 0.5
}

class AgeVisual {

  constructor() {
    const f = s => s.depute?.dateNais ? this.getAge(s.depute.dateNais) : 0

    //const f = s => s.depute?.twitter?.public_metrics?.followers_count || 0
    const ages = sieges.filter(s => s.depute?.dateNais).map(s => f(s))
    //const sorted = sieges.sort((a,b) => f(b) - f(a))
    const max = ages.reduce((acc, x) => Math.max(acc, x))
    const min = ages.reduce((acc, x) => Math.min(acc, x))
    this.global = {
      avg: ages.reduce((acc, x) => acc + x) / sieges.length,
      max, min,
      span: max - min
      //sorted,
    }
    //no this.p because linear
    this.f = f
  }

  getAge(dateNais) {
      var today = new Date();
      const birthDate = new Date(dateNais)
      var age = today.getFullYear() - birthDate.getFullYear();
      var m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
      }
      return age;
  }

  //color rate Get a number between 0 and 1
  t(age) {
    const {min, span} = this.global
    return (age - min) / span
  }

  //reverse t to original value
  tToValue(t) {
    const {min, span} = this.global
    return t * span + min
  }

  color(t) {
    const [start, end] = [youngColor, oldColor]
    return {
      h: (end.h - start.h) * t + start.h,
       s: (end.s - start.s) * t + start.s,
       v: (end.v - start.v) * t + start.v,
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
       const value = Math.round(this.tToValue(rate))
       samples.push(<text x={w + 5} y={h * (1-rate) + 5} fill="rgba(255, 255, 255, 0.9)">{value}</text>);
     }

     return <Fragment>
       <style>{`
         .old { stop-color: hsl(${oldColor.h}, ${oldColor.s}%, ${oldColor.v}%); }
         .young { stop-color: hsl(${youngColor.h}, ${youngColor.s}%, ${youngColor.v}%); }
       `}</style>
       <div className="caption"  xmlns="http://www.w3.org/1999/xhtml">
         <svg className="img" width={350} height={400}>
           <defs>
             <linearGradient id="Gradient1" x1="0" x2="0" y1="0" y2="1">
               <stop offset="0%" class="old"/>
               <stop offset="100%" class="young"/>
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

export default new AgeVisual()
