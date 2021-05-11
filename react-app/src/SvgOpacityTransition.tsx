import { CSSProperties } from '@material-ui/styles';
import { PureComponent } from 'react';
import { Transition } from 'react-transition-group';


const defaultStyle = {
  transition: `opacity 300ms ease ${0.65*2}s`,
  opacity: 0,
}

const transitionStyles : Record<string, CSSProperties> = {
  entering: { opacity: 0 },
  entered:  { opacity: 1 },
  exiting:  { opacity: 0 },
  exited:  { opacity: 0 },
};

interface Props {}
interface State {}

export class SvgOpacityTransition extends PureComponent<Props, State> {

  render() {
    const {children, ...remaining} = this.props
    return <Transition {...remaining} timeout={500}>
      {animState => (<g style={{...defaultStyle, ...transitionStyles[animState]}}>
        {children}
      </g>)}
    </Transition>
  }

}
