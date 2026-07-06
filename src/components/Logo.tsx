import { useId } from "react"
import { cn } from "@/lib/utils"

/** The Formatif mark: a layered, gradient-shaded "F" on an accent-colored
 *  squircle that follows the user's chosen accent color (see AppearancePanel). */
export function Logo({ className }: { className?: string }) {
  const uid = useId()
  const clip = `${uid}-clip`
  const gStroke = `${uid}-stroke`
  const gTop = `${uid}-top`
  const gMid = `${uid}-mid`
  const shadow = `${uid}-shadow`
  const contact = `${uid}-contact`

  return (
    <div className={cn("bg-primary overflow-hidden rounded-[22%]", className)}>
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="size-full">
        <defs>
          <clipPath id={clip}>
            <path d="M 73,50 L 122.5,50 A 12.5,12.5 0 0,1 122.5,75 L 95,75 L 95,84 Q 95,90 101,90 L 102.5,90 A 12.5,12.5 0 0,1 102.5,115 L 95,115 L 95,142 Q 95,150 87,150 L 73,150 Q 65,150 65,142 L 65,58 Q 65,50 73,50 Z" />
          </clipPath>
          <linearGradient id={gStroke} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F5F5F8" />
          </linearGradient>
          <linearGradient id={gTop} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8F8FB" />
            <stop offset="100%" stopColor="#ECECF1" />
          </linearGradient>
          <linearGradient id={gMid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F0F0F4" />
            <stop offset="100%" stopColor="#E2E2E9" />
          </linearGradient>
          <filter id={shadow} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
          </filter>
          <filter id={contact} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.3" />
          </filter>
        </defs>
        <g filter={`url(#${shadow})`}>
          <g clipPath={`url(#${clip})`}>
            <rect x="65" y="50" width="30" height="100" fill={`url(#${gStroke})`} />
            <rect x="65" y="50" width="70" height="25" fill={`url(#${gTop})`} filter={`url(#${contact})`} />
            <rect x="65" y="90" width="50" height="25" fill={`url(#${gMid})`} filter={`url(#${contact})`} />
          </g>
        </g>
      </svg>
    </div>
  )
}
