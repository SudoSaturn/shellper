// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

import ScreenshotQueue from "../components/Queue/ScreenshotQueue"

import { ProblemStatementData } from "../types/solutions"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"
import { COMMAND_KEY } from "../utils/platform"

export const ContentSection = ({
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
          Extracting problem statement...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-gray-100 max-w-[600px]">
        {content}
      </div>
    )}
  </div>
)
const SolutionSection = ({
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
      <div className="space-y-1.5">
        <div className="mt-4 flex">
          <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
            Loading solutions...
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
          {content as string}
        </SyntaxHighlighter>
      </div>
    )}
  </div>
)

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      Complexity
    </h2>
    {isLoading ? (
      <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
        Calculating complexity...
      </p>
    ) : (
      <div className="space-y-1">
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-gray-100">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <strong>Time:</strong> {timeComplexity}
          </div>
        </div>
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-gray-100">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <strong>Space:</strong> {spaceComplexity}
          </div>
        </div>
      </div>
    )}
  </div>
)

export interface SolutionsProps {
  setView: (view: "queue" | "solutions" | "debug") => void
}
const Solutions: React.FC<SolutionsProps> = ({
  setView
}) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  const [debugProcessing, setDebugProcessing] = useState(false)
  const [problemStatementData, setProblemStatementData] =
    useState<ProblemStatementData | null>(null)
  const [solutionData, setSolutionData] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)

  interface Screenshot {
    id: string
    path: string
    preview: string
    timestamp: number
  }

  const [extraScreenshots, setExtraScreenshots] = useState<Screenshot[]>([])

  useEffect(() => {
    // Height update logic
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

  // Set up initial data from query client
  useEffect(() => {
    setProblemStatementData(
      queryClient.getQueryData(["problem_statement"]) || null
    )
    
    const solution = queryClient.getQueryData(["solution"]) as {
      code: string
      thoughts: string[]
      time_complexity: string
      space_complexity: string
    } | null

    if (solution) {
      setSolutionData(solution.code || null)
      setThoughtsData(solution.thoughts || null)
      setTimeComplexityData(solution.time_complexity || null)
      setSpaceComplexityData(solution.space_complexity || null)
    }

    // Listen for query cache updates
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === "problem_statement") {
        setProblemStatementData(
          queryClient.getQueryData(["problem_statement"]) || null
        )
      }
      if (event?.query.queryKey[0] === "solution") {
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
        } | null

        if (solution) {
          setSolutionData(solution.code || null)
          setThoughtsData(solution.thoughts || null)
          setTimeComplexityData(solution.time_complexity || null)
          setSpaceComplexityData(solution.space_complexity || null)
        }
      }
    })
    
    return () => unsubscribe()
  }, [queryClient])

  // Set up event listeners
  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(async () => {
        try {
          const existing = await window.electronAPI.getScreenshots()
          const screenshots = (Array.isArray(existing) ? existing : []).map(
            (p: any) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now()
            })
          )
          setExtraScreenshots(screenshots)
        } catch (error) {
          console.error("Error loading extra screenshots:", error)
        }
      }),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true)

        // Remove queries
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["new_solution"]
        })

        // Reset screenshots
        setExtraScreenshots([])

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onSolutionStart(() => {
        // Every time processing starts, reset relevant states
        setSolutionData(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)
      }),
      window.electronAPI.onProblemExtracted((data: any) => {
        console.log("Problem data:", data);
        
        // Create a formatted problem statement
        let problemStatement = "";
        
        if (data.title) {
          problemStatement += `# ${data.title}\n\n`;
        }
        
        if (data.description) {
          problemStatement += `${data.description}\n\n`;
        }
        
        if (data.examples && data.examples.length > 0) {
          problemStatement += "## Examples\n\n";
          data.examples.forEach((ex: any, i: number) => {
            problemStatement += `Example ${i + 1}:\n`;
            if (ex.input) problemStatement += `Input: ${ex.input}\n`;
            if (ex.output) problemStatement += `Output: ${ex.output}\n`;
            if (ex.explanation) problemStatement += `Explanation: ${ex.explanation}\n`;
            problemStatement += "\n";
          });
        }
        
        if (data.constraints && data.constraints.length > 0) {
          problemStatement += "## Constraints\n\n";
          data.constraints.forEach((constraint: string) => {
            problemStatement += `- ${constraint}\n`;
          });
          problemStatement += "\n";
        }
        
        if (data.function_signature) {
          problemStatement += `## Function Signature\n\n${data.function_signature}\n\n`;
        }
        
        // Set the formatted problem statement
        const formattedData = {
          ...data,
          problem_statement: problemStatement
        };
        
        queryClient.setQueryData(["problem_statement"], formattedData);
      }),
      window.electronAPI.onSolutionSuccess((data: any) => {
        if (!data) {
          console.warn("Received empty or invalid solution data")
          return
        }
        console.log("Solution data:", data)

        // Parse solution text to extract code, thoughts, and complexity
        const solutionText = data.solution || "";
        const codePattern = /(```[\w\s]*\n)([\s\S]*?)(```)/g;
        const codeMatches = [...solutionText.matchAll(codePattern)];
        
        // Get the actual code (usually the largest code block)
        let code = "";
        if (codeMatches.length > 0) {
          // Find the largest code block
          code = codeMatches.reduce((largest, match) => 
            match[2].length > largest.length ? match[2] : largest
          , "");
        }
        
        // Extract time and space complexity
        const timeComplexityMatch = solutionText.match(/[Tt]ime [Cc]omplexity:?\s*([^\.]*)/);
        const spaceComplexityMatch = solutionText.match(/[Ss]pace [Cc]omplexity:?\s*([^\.]*)/);
        
        const timeComplexity = timeComplexityMatch ? timeComplexityMatch[1].trim() : "O(n)";
        const spaceComplexity = spaceComplexityMatch ? spaceComplexityMatch[1].trim() : "O(n)";
        
        // Split text into reasoning sections (before code)
        const thoughts = solutionText
          .split(/```[\w\s]*\n[\s\S]*?```/)[0]
          .split(/\n\s*\n/)
          .filter((t: string) => t.trim().length > 10) // Filter out short sections
          .map((t: string) => t.trim());
        
        const solutionData = {
          code: code || solutionText,
          thoughts: thoughts || [],
          time_complexity: timeComplexity || "O(n)",
          space_complexity: spaceComplexity || "O(n)"
        };

        queryClient.setQueryData(["solution"], solutionData)
        setSolutionData(solutionData.code || null)
        setThoughtsData(solutionData.thoughts || null)
        setTimeComplexityData(solutionData.time_complexity || null)
        setSpaceComplexityData(solutionData.space_complexity || null)

        // Fetch latest screenshots when solution is successful
        const fetchScreenshots = async () => {
          try {
            const existing = await window.electronAPI.getScreenshots()
            const screenshots = Array.isArray(existing) ? 
              existing.map((p: any) => ({
                id: p.path,
                path: p.path,
                preview: p.preview,
                timestamp: Date.now()
              })) : []
            setExtraScreenshots(screenshots)
          } catch (error) {
            console.error("Error loading extra screenshots:", error)
            setExtraScreenshots([])
          }
        }
        fetchScreenshots()
      }),
      window.electronAPI.onSolutionError((error: string) => {
        console.error("Processing Failed:", error)
        // Reset solutions in the cache and complexities to previous states
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
        } | null
        if (!solution) {
          setView("queue")
        }
        setSolutionData(solution?.code || null)
        setThoughtsData(solution?.thoughts || null)
        setTimeComplexityData(solution?.time_complexity || null)
        setSpaceComplexityData(solution?.space_complexity || null)
        console.error("Processing error:", error)
      }),
      window.electronAPI.onDebugStart(() => {
        setDebugProcessing(true)
      }),
      window.electronAPI.onDebugSuccess((data: any) => {
        queryClient.setQueryData(["new_solution"], data)
        setDebugProcessing(false)
      }),
      window.electronAPI.onDebugError(() => {
        console.error("Processing Failed: There was an error debugging your code.")
        setDebugProcessing(false)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        console.log("No Screenshots: There are no extra screenshots to process.")
      })
    ]

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup())
    }
  }, [])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        // Fetch and update screenshots after successful deletion
        const existing = await window.electronAPI.getScreenshots()
        const screenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        setExtraScreenshots(screenshots)
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
    }
  }

  const handleRegenerateProblemStatement = async () => {
    try {
      // Reset state
      setProblemStatementData(null)
      setSolutionData(null)
      setTimeComplexityData(null)
      setSpaceComplexityData(null)
      
      // Trigger reprocessing
      const result = await window.electronAPI.triggerProcessScreenshots()
      if (!result.success) {
        console.error("Error: Failed to regenerate problem statement")
      }
    } catch (error) {
      console.error("Error regenerating problem statement:", error)
    }
  }

  const handleRegenerateSolution = async () => {
    try {
      // Only reset solution data, keep problem statement
      setSolutionData(null)
      setTimeComplexityData(null)
      setSpaceComplexityData(null)
      
      // Trigger solution regeneration
      const result = await window.electronAPI.triggerProcessScreenshots()
      if (!result.success) {
        console.error("Error: Failed to regenerate solution")
      }
    } catch (error) {
      console.error("Error regenerating solution:", error)
    }
  }

  return (
    <>
      {!isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <Debug
          isProcessing={debugProcessing}
          setIsProcessing={setDebugProcessing}
        />
      ) : (
        <div ref={contentRef} className="relative space-y-3 px-4 py-3">
          {/* Conditionally render the screenshot queue if solutionData is available */}
          {solutionData && (
            <div className="bg-transparent w-fit">
              <div className="pb-3">
                <div className="space-y-3 w-fit">
                  <ScreenshotQueue
                    isLoading={debugProcessing}
                    screenshots={extraScreenshots}
                    onDeleteScreenshot={handleDeleteExtraScreenshot}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Navbar of commands with the SolutionsHelper */}
          <SolutionCommands
            regenerateProblemStatement={handleRegenerateProblemStatement}
            regenerateSolution={handleRegenerateSolution}
            isProcessing={!problemStatementData || !solutionData}
            extraScreenshots={extraScreenshots}
          />

          {/* Main Content - Modified width constraints */}
          <div className="w-full text-sm text-black bg-black/60 rounded-md">
            <div className="rounded-lg overflow-hidden">
              <div className="px-4 py-3 space-y-4 max-w-full">
                {!solutionData && (
                  <>
                    <ContentSection
                      title="Problem Statement"
                      content={problemStatementData?.problem_statement}
                      isLoading={!problemStatementData}
                    />
                    {problemStatementData && (
                      <div className="mt-4 flex">
                        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
                          Generating solutions...
                        </p>
                      </div>
                    )}
                  </>
                )}

                {solutionData && (
                  <>
                    <ContentSection
                      title={`My Thoughts (${COMMAND_KEY} + Arrow keys to scroll)`}
                      content={
                        thoughtsData && (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              {thoughtsData.map((thought, index) => (
                                <div
                                  key={index}
                                  className="flex items-start gap-2"
                                >
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

                    <SolutionSection
                      title="Solution"
                      content={solutionData}
                      isLoading={!solutionData}
                    />

                    <ComplexitySection
                      timeComplexity={timeComplexityData}
                      spaceComplexity={spaceComplexityData}
                      isLoading={!timeComplexityData || !spaceComplexityData}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Solutions
