import { StrictMode, use, Suspense, Component, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { loadAssembly } from "./data/assembly.ts"
import { colorableFeatures, createFeatureStore } from "./data/features.ts"
import { readPublished } from "./data/published.ts"
import { parseChrome } from "./embed/chrome.ts"
import { markDrawing } from "./layout/useDrawing.ts"
import { createFeatureCache } from "./sources/values.ts"
import { DEFAULT_COLOR_FEATURE, HIDDEN_FEATURES } from "./sources/views.ts"
import { readParam } from "./url.ts"
import { defaultColoring, parseView } from "./view/view.ts"
import "./styles.css"

const chrome = parseChrome(readParam)
document.documentElement.dataset.chrome = chrome.kind
markDrawing("loading")

const loaded = loadAssembly(readPublished).then(async assembly => {
  const features = colorableFeatures(assembly.catalog, HIDDEN_FEATURES)
  const cache = createFeatureCache(createFeatureStore(assembly.initRows, readPublished))
  const defaultColor = defaultColoring(features, DEFAULT_COLOR_FEATURE)
  if (!defaultColor) throw new Error(`catalog.json: no feature ${DEFAULT_COLOR_FEATURE}`)
  const initial = parseView(readParam, features, defaultColor)
  await cache.load(initial.fallback.of)
  return { assembly, features, cache, initial }
})

function Loaded({ app }: { app: typeof loaded }) {
  return <App {...use(app)} chrome={chrome} read={readPublished} />
}

class LoadError extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch() {
    markDrawing("error")
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

const root = document.getElementById("root")
if (root === null) throw new Error("index.html has no #root element")

createRoot(root).render(
  <StrictMode>
    <LoadError>
      <Suspense fallback={<div className="screen">Chargement de l'hémicycle…</div>}>
        <Loaded app={loaded} />
      </Suspense>
    </LoadError>
  </StrictMode>,
)
