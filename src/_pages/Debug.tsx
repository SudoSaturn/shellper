// Debug.tsx
import React, { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import { Screenshot } from "../types/screenshots"

// Code section component to display code with syntax highlighting
const CodeSection = ({
  title,
  code,
  isLoading
}: {
  title: string
  code: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="space-y-1.5">
        <div className="mt-4 flex">
          <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
            Loading debug data...
          </p>
        </div>
      </div>
    ) : (
      <div className="w-full">
        <SyntaxHighlighter
          showLineNumbers
          language="auto"
          style={dracula}
          customStyle={{
            maxWidth: "100%",
            margin: 0,
            padding: "1rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            backgroundColor: "rgba(22, 27, 34, 0.5)"
          }}
          wrapLongLines={true}
        >
          {code as string}
        </SyntaxHighlighter>
      </div>
    )}
  </div>
)

// Content section component for displaying text content
const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Loading debug content...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-gray-100 max-w-[600px]">
        {content}
      </div>
    )}
  </div>
)

// Fetch screenshots from electron API
async function fetchScreenshots(): Promise<Screenshot[]> {
  try {
    const existing = await window.electronAPI.getScreenshots()
    return existing
  } catch (error) {
    console.error("Error loading screenshots:", error)
    throw error
  }
}

// Debug component props
interface DebugProps {
  isProcessing: boolean
  setIsProcessing: (isProcessing: boolean) => void
}

// Debug component - displays debugging information
const Debug: React.FC<DebugProps> = ({
  isProcessing,
  setIsProcessing
}) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)
  const [solution, setSolution] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])

  // Load data from query client
  useEffect(() => {
    const newSolution = queryClient.getQueryData(["new_solution"]) as {
      solution: string
      thoughts: string[]
    } | null
    if (newSolution) {
      setSolution(newSolution.solution || null)
      setThoughtsData(newSolution.thoughts || null)
    }
  }, [queryClient])

  // Load screenshots
  useEffect(() => {
    const loadScreenshots = async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        const screenshotData = Array.isArray(existing)
          ? existing.map((p) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now()
            }))
          : []
        setScreenshots(screenshotData)
      } catch (error) {
        console.error("Error loading debug screenshots:", error)
        setScreenshots([])
      }
    }
    loadScreenshots()
  }, [])

  // Update window dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    return () => resizeObserver.disconnect()
  }, [])

  // Handle tooltip visibility changes
  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  // Handle screenshot deletion
  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        // Fetch and update screenshots after successful deletion
        const existing = await window.electronAPI.getScreenshots()
        const updatedScreenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        setScreenshots(updatedScreenshots)
      } else {
        console.error("Failed to delete debug screenshot:", response.error)
      }
    } catch (error) {
      console.error("Error deleting debug screenshot:", error)
    }
  }

  // Define the regenerate functions
  const regenerateProblemStatement = () => {
    console.log("Regenerate problem statement not applicable in debug view")
  }

  const regenerateSolution = () => {
    console.log("Regenerate solution not applicable in debug view")
  }

  return (
    <div ref={contentRef} className="space-y-3 px-4 py-3">
      {/* Navbar of commands with the tooltip */}
      <SolutionCommands
        regenerateProblemStatement={regenerateProblemStatement}
        regenerateSolution={regenerateSolution}
        isProcessing={isProcessing}
        extraScreenshots={screenshots}
      />

      {/* Main Content */}
      <div className="w-full text-sm text-black bg-black/60 rounded-md">
        <div className="rounded-lg overflow-hidden">
          <div className="px-4 py-3 space-y-4">
            {/* Thoughts Section */}
            <ContentSection
              title="What I Changed"
              content={
                thoughtsData && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      {thoughtsData.map((thought, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
                          <div>{thought}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              isLoading={!thoughtsData}
            />

            {/* Solution Section */}
            <CodeSection
              title="Fixed Code"
              code={solution}
              isLoading={!solution}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Debug
