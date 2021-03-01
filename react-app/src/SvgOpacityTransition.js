import { PureComponent, React } from 'react';
import { Transition } from 'react-transition-group';


const defaultStyle = {
  transition: `opacity 300ms ease ${0.65*2}s`,
  opacity: 0,
}

const transitionStyles = {
  entering: { opacity: 0 },
  entered:  { opacity: 1 },
  exiting:  { opacity: 0 },
  exited:  { opacity: 0 },
};

export class SvgOpacityTransition extends PureComponent {

  render() {
    const {children, ...remaining} = this.props
    return <Transition {...remaining} timeout={500}>
      {animState => (<g style={{...defaultStyle, ...transitionStyles[animState]}}>
        {children}
      </g>)}
    </Transition>
  }

}
