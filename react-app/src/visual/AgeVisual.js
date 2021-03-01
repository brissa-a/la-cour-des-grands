import { groupBy } from '../functional.js';

const youngColor = {
  h: 31 ,
  s: 23.0,
  v: 150 * 0.5
}
const oldColor = {
  h: 31,
  s: 88,
  v: 30 * 0.5
}

function getAge(dateNais) {
    var today = new Date();
    const birthDate = new Date(dateNais)
    var age = today.getFullYear() - birthDate.getFullYear();
    var m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}
const f = d => getAge(d.an_data_depute.dateNais)
const groupByAge = groupBy(f)

function minMaxRange(list, getter) {
  if (getter) list = list.map(getter)
  const min = Math.min(...list)
  const max = Math.max(...list)
  const range = max - min
  const avg = list.reduce((a, b) => a + b, 0) / list.length
  return {min,max,range, avg}
}

const  AgeVisual = deputes => new class {

  constructor() {
    const ages = deputes.map(d => f(d))
    const max = ages.reduce((acc, x) => Math.max(acc, x))
    const min = ages.reduce((acc, x) => Math.min(acc, x))
    this.global = {
      avg: ages.reduce((acc, x) => acc + x) / deputes.length,
      max, min,
      span: max - min
    }
    //no this.p because linear
    this.f = f
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

   deputeColor(depute) {
     return this.color(this.t(this.f(depute)))
   }

   sort(sa, sb) {
     return f(sb) - f(sa)
   }

   group(deputes) {
     const ages = deputes.map(d => getAge(d.an_data_depute.dateNais))
     const mmrAges = minMaxRange(ages)
     const agesGroup = {}
     for (let i = mmrAges.min; i <= mmrAges.max; i++) {
       agesGroup[i] = []
     }
     const groupes = Object.entries(deputes
       .reduce(groupByAge, agesGroup))
     return {groupes, maxColSize: 1}
   }

   formatGroupeName(groupeName) {
     return groupeName
   }

   xAxisName() {return "ans"}

   caption() {
     const sampleCount = 5
     const [w,h] = [15, 300]

     const samples = [];
     for (let i = 0; i <= (sampleCount - 1); i++) {
       const rate = i/(sampleCount - 1)
       const value = Math.round(this.tToValue(rate))
       samples.push(<text key={i} x={w + 5} y={h * (1-rate) + 5} fill="rgba(255, 255, 255, 0.9)">{value}</text>);
     }

     return       <foreignObject transform="scale(0.07)" width="50" height="450">
     <div className="undraggable">
       <style>{`
         .old { stop-color: hsl(${oldColor.h}, ${oldColor.s}%, ${oldColor.v}%); }
         .young { stop-color: hsl(${youngColor.h}, ${youngColor.s}%, ${youngColor.v}%); }
       `}</style>
       <div className="caption"  xmlns="http://www.w3.org/1999/xhtml">
         <svg className="img" width={350} height={400}>
           <defs>
             <linearGradient id="Gradient1" x1="0" x2="0" y1="0" y2="1">
               <stop offset="0%" className="old"/>
               <stop offset="100%" className="young"/>
             </linearGradient>
           </defs>
           <g transform="translate(10, 10)">
           <rect x="0" y="0" rx="5" ry="5" width={w} height={h} fill="url(#Gradient1)"/>
           {samples}
           </g>
         </svg>
       </div>
       </div>
    </foreignObject >
   }
}

export default AgeVisual
