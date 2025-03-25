import { useState, useEffect, useCallback } from "react"
import MainApp from "./_pages/MainApp"
import {
  QueryClient,
  QueryClientProvider
} from "@tanstack/react-query"

// Create a React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: Infinity,
      retry: 1,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 1
    }
  }
})

// Root component that provides the QueryClient
function App() {
  const [isInitialized, setIsInitialized] = useState(false)

  // Mark the app as initialized
  const markInitialized = useCallback(() => {
    window.__IS_INITIALIZED__ = true
    setIsInitialized(true)
  }, [])

  // Initialize app settings
  useEffect(() => {
    // Mark as initialized after a short delay
    setTimeout(() => {
      markInitialized()
    }, 500)

    // Cleanup function
    return () => {
      // Reset initialization state on cleanup
      window.__IS_INITIALIZED__ = false
      setIsInitialized(false)
    }
  }, [markInitialized])

  return (
    <QueryClientProvider client={queryClient}>
      <AppContent isInitialized={isInitialized} />
    </QueryClientProvider>
  )
}

// Simplified app content with no auth
function AppContent({ isInitialized }: { isInitialized: boolean }) {
  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 p-6 rounded-lg backdrop-blur-md bg-black/60">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
          <p className="text-white/60 text-sm">
            {!isInitialized
              ? "Initializing...If you see this screen for more than 10 seconds, please quit and restart the app."
              : "Loading local settings..."}
          </p>
        </div>
      </div>
    )
  }

  // Show the main app
  return <MainApp />
}

export default App
