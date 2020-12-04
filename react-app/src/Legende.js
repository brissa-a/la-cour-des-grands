import groupes from './groupes.json'

const style = {
  position: "fixed",
  right: 0, top: 0,
  color: "white",
  //boxShadow: "0px 0px 5px black",
  //background: "rgba(0,0,0,0.5)",
  //borderRadius: "0px 0px 0px 5px",
  padding: "10px",
  textAlign: "left"
}

const truncate = {
  textOverflow: "ellipsis",
  width: "250px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  display: "block",
  backgroundColor: "rgba(0,0,0,0.2)",
  boxShadow: "rgba(0,0,0,0.6) 0px 0px 29px",
  backdropFilter: "blur(5px) saturate(50%)"
}

const groupHtml = Object.keys(groupes).map(name => {
  const color = groupes[name].color
  const iconsize = 15
  return <div key={name} style={truncate}>
    <svg width={iconsize} height={iconsize} style={{verticalAlign: "middle", margin: "2px 10px"}}>
          <circle
             style={{fill: `hsl(${color.h},  ${color.s}%, ${color.v}%)`}}
             r={iconsize/2} cx={iconsize/2} cy={iconsize/2}
          />
          <circle
             style={{fill: `hsl(0, 0%, 0%, 0.6)`}}
             r={iconsize/2*0.90} cx={iconsize/2} cy={iconsize/2}
          />
    </svg>
    {name}
  </div>
})

const Legend = () => <div style={style} >
  {groupHtml}
</div>

export default Legend
