import { StrictMode, use, Suspense, Component, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { loadAssembly, type Assembly } from "./data/assembly.ts"
import "./styles.css"

const assemblyPromise = loadAssembly()

function Loaded({ assembly }: { assembly: Promise<Assembly> }) {
  return <App assembly={use(assembly)} />
}

class LoadError extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="screen">
        <p>Impossible de charger les données.</p>
        <pre>{this.state.error.message}</pre>
      </div>
    )
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoadError>
      <Suspense fallback={<div className="screen">Chargement de l'hémicycle…</div>}>
        <Loaded assembly={assemblyPromise} />
      </Suspense>
    </LoadError>
  </StrictMode>,
)
