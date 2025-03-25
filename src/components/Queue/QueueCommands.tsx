import React, { useState, useEffect, useRef } from "react"
import { COMMAND_KEY } from "../../utils/platform"

export interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  isProcessing?: boolean
  screenshotCount: number
}

export const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  isProcessing = false,
  screenshotCount
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [isScreenshotInProgress, setIsScreenshotInProgress] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Setup event listener for screenshot in progress
  useEffect(() => {
    const cleanup = window.electronAPI.onScreenshotInProgress((inProgress) => {
      setIsScreenshotInProgress(inProgress)
    })
    
    return cleanup
  }, [])

  const handleCaptureClick = async () => {
    try {
      if (isScreenshotInProgress) {
        console.log("Screenshot in progress. Please wait for the current screenshot to complete")
        return
      }
      
      const result = await window.electronAPI.triggerScreenshot()
      if (!result.success) {
        console.error("Failed to take screenshot:", result.error)
      } else {
        console.log("Screenshot captured successfully")
      }
    } catch (error) {
      console.error("Error taking screenshot:", error)
    }
  }

  const handleGenerateClick = async () => {
    try {
      // Don't allow generation if no screenshots are available
      if (screenshotCount === 0) {
        console.log("No screenshots available. Please take at least one screenshot first")
        return
      }
      
      // Don't allow generation if processing is already in progress
      if (isProcessing) {
        console.log("Processing in progress. Please wait for current processing to complete")
        return
      }
      
      // Log that we're attempting to process screenshots
      console.log("Attempting to process screenshots. Count:", screenshotCount)
      
      const result = await window.electronAPI.triggerProcessScreenshots()
      if (!result.success) {
        console.error("Failed to process screenshots:", result.error)
      } else {
        console.log("Processing started. Analyzing your screenshots...")
      }
    } catch (error) {
      console.error("Error processing screenshots:", error)
    }
  }

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible])

  const handleMouseEnter = () => {
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    setIsTooltipVisible(false)
  }

  return (
    <div>
      <div className="pt-2 w-fit">
        <div className="text-xs text-white/90 backdrop-blur-md bg-black/60 rounded-lg py-2 px-4 flex items-center justify-center gap-4">
          {/* Screenshot */}
          <div
            className={`flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-white/10 transition-colors ${isScreenshotInProgress ? 'opacity-50 pointer-events-none' : ''}`}
            onClick={handleCaptureClick}
          >
            <span className="text-[11px] leading-none truncate">
              {isScreenshotInProgress 
                ? "Taking screenshot..." 
                : screenshotCount === 0
                ? "Capture screen"
                : screenshotCount === 1
                ? "Capture second screen"
                : "Replace first screenshot"}
            </span>
            <div className="flex gap-1">
              <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                {COMMAND_KEY}
              </button>
              <button className="bg-white/10 rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">
                H
              </button>
            </div>
          </div>

          {/* Solve Command */}
          <div
            className={`cursor-pointer rounded px-2 py-1.5 hover:bg-white/10 transition-colors ${
              screenshotCount > 0
                ? ""
                : "opacity-50 cursor-not-allowed"
            }`}
            onClick={handleGenerateClick}
          >
            <div className="flex items-center justify-between">
              <span className="truncate">Solve</span>
              <div className="flex gap-1 flex-shrink-0">
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                  {COMMAND_KEY}
                </span>
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                  ↵
                </span>
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-white/70 truncate mt-1">
              {screenshotCount > 0
                ? "Generate a solution based on the current problem."
                : "Take a screenshot first to generate a solution."}
            </p>
          </div>

          {/* Separator */}
          <div className="mx-2 h-4 w-px bg-white/20" />

          {/* Settings with Tooltip */}
          <div
            className="relative inline-block"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Gear icon */}
            <div className="w-4 h-4 flex items-center justify-center cursor-pointer text-white/70 hover:text-white/90 transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>

            {/* Tooltip Content */}
            {isTooltipVisible && (
              <div
                ref={tooltipRef}
                className="absolute top-full left-0 mt-2 w-80 transform -translate-x-[calc(50%-12px)]"
                style={{ zIndex: 100 }}
              >
                {/* Add transparent bridge */}
                <div className="absolute -top-2 right-0 w-full h-2" />
                <div className="p-3 text-xs bg-black/80 backdrop-blur-md rounded-lg border border-white/10 text-white/90 shadow-lg">
                  <div className="space-y-4">
                    <h3 className="font-medium truncate">Keyboard Shortcuts</h3>
                    <div className="space-y-3">
                      {/* Toggle Command */}
                      <div
                        className="cursor-pointer rounded px-2 py-1.5 hover:bg-white/10 transition-colors"
                        onClick={async () => {
                          try {
                            const result =
                              await window.electronAPI.toggleMainWindow()
                            if (!result.success) {
                              console.error(
                                "Failed to toggle window:",
                                result.error
                              )
                            }
                          } catch (error) {
                            console.error("Error toggling window:", error)
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">Toggle Window</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              B
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] leading-relaxed text-white/70 truncate mt-1">
                          Show or hide this window.
                        </p>
                      </div>

                      {/* Screenshot Command */}
                      <div
                        className="cursor-pointer rounded px-2 py-1.5 hover:bg-white/10 transition-colors"
                        onClick={handleCaptureClick}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">Capture Screen</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              H
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] leading-relaxed text-white/70 truncate mt-1">
                          Take an automatic full-screen screenshot for OCR processing.
                        </p>
                      </div>

                      {/* Solve Command */}
                      <div
                        className={`cursor-pointer rounded px-2 py-1.5 hover:bg-white/10 transition-colors ${
                          screenshotCount > 0
                            ? ""
                            : "opacity-50 cursor-not-allowed"
                        }`}
                        onClick={handleGenerateClick}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">Solve</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              {COMMAND_KEY}
                            </span>
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none">
                              ↵
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] leading-relaxed text-white/70 truncate mt-1">
                          {screenshotCount > 0
                            ? "Generate a solution based on the current problem."
                            : "Take a screenshot first to generate a solution."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default QueueCommands;