interface Window {
  __IS_INITIALIZED__: boolean
  electronAPI: {
    // Core APIs
    updateContentDimensions: (dimensions: { width: number; height: number }) => Promise<void>
    clearStore: () => Promise<{ success: boolean; error?: string }>
    getScreenshots: () => Promise<any>
    deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>
    
    // Event listeners
    onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
    onInitialStart: (callback: () => void) => () => void
    onResetView: (callback: () => void) => () => void
    onSolutionStart: (callback: () => void) => () => void
    onDebugStart: (callback: () => void) => () => void
    onDebugSuccess: (callback: (data: any) => void) => () => void
    onSolutionError: (callback: (error: string) => void) => () => void
    onProcessingNoScreenshots: (callback: () => void) => () => void
    onProblemExtracted: (callback: (data: any) => void) => () => void
    onSolutionSuccess: (callback: (data: any) => void) => () => void
    onDebugError: (callback: (error: string) => void) => () => void
    
    // External
    openExternal: (url: string) => void
    
    // Window management
    toggleMainWindow: () => Promise<{ success: boolean; error?: string }>
    
    // Screenshot functionality
    triggerScreenshot: () => Promise<{ success: boolean; error?: string }>
    triggerProcessScreenshots: () => Promise<{ success: boolean; error?: string }>
    triggerReset: () => Promise<{ success: boolean; error?: string }>
    
    // Window positioning
    triggerMoveLeft: () => Promise<{ success: boolean; error?: string }>
    triggerMoveRight: () => Promise<{ success: boolean; error?: string }>
    triggerMoveUp: () => Promise<{ success: boolean; error?: string }>
    triggerMoveDown: () => Promise<{ success: boolean; error?: string }>
    
    // System info
    getPlatform: () => string
    onScreenshotInProgress: (callback: (isInProgress: boolean) => void) => () => void
  }
}
