import { StrictMode, use, Suspense, Component, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { App, loadInitialColoring } from "./App.tsx"
import { loadAssembly } from "./data/assembly.ts"
import { createFeatureStore } from "./data/features.ts"
import "./styles.css"

const loaded = loadAssembly().then(async assembly => {
  const store = createFeatureStore(assembly)
  return { assembly, store, initialColoring: await loadInitialColoring(assembly, store) }
})

function Loaded({ app }: { app: typeof loaded }) {
  return <App {...use(app)} />
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
        <Loaded app={loaded} />
      </Suspense>
    </LoadError>
  </StrictMode>,
)
