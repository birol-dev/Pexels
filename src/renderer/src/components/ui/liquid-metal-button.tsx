import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ShaderMount,
  defaultObjectSizing,
  liquidMetalFragmentShader,
  type ShaderMountUniforms
} from '@paper-design/shaders'
import { SparkleIcon } from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'

interface LiquidMetalButtonProps {
  label?: string
  onClick?: () => void
  viewMode?: 'text' | 'icon'
  /** Outer width in px for `text` mode (the pill height is fixed at 46px). */
  width?: number
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}

const HEIGHT = 46
const BORDER = 2
const EASE = 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)'
const SIZE_EASE = 'width 0.4s ease, height 0.4s ease'

const SPEED_IDLE = 0.6
const SPEED_HOVER = 1
const SPEED_CLICK = 2.4

// Sizing uniforms the installed shader version requires, taken from its object defaults.
const sizing = {
  u_fit: { none: 0, contain: 1, cover: 2 }[defaultObjectSizing.fit],
  u_scale: 8,
  u_rotation: defaultObjectSizing.rotation,
  u_originX: defaultObjectSizing.originX,
  u_originY: defaultObjectSizing.originY,
  u_offsetX: 0.1,
  u_offsetY: -0.1,
  u_worldWidth: defaultObjectSizing.worldWidth,
  u_worldHeight: defaultObjectSizing.worldHeight
}

const SHADER_UNIFORMS: ShaderMountUniforms = {
  ...sizing,
  u_colorBack: [0.667, 0.667, 0.675, 1],
  u_colorTint: [1, 1, 1, 1],
  u_image: undefined,
  u_isImage: false,
  u_repetition: 4,
  u_softness: 0.5,
  u_shiftRed: 0.3,
  u_shiftBlue: 0.3,
  u_distortion: 0,
  u_contour: 0,
  u_angle: 45,
  u_shape: 1
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function LiquidMetalButton({
  label = 'Get Started',
  onClick,
  viewMode = 'text',
  width = 142,
  type = 'button',
  disabled = false,
  className
}: LiquidMetalButtonProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([])
  const shaderRef = useRef<HTMLDivElement>(null)
  const shaderMount = useRef<ShaderMount | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const rippleId = useRef(0)
  const timers = useRef<number[]>([])
  const hovered = useRef(false)

  const dimensions = useMemo(() => {
    const w = viewMode === 'icon' ? HEIGHT : width
    return {
      width: w,
      height: HEIGHT,
      innerWidth: w - BORDER * 2,
      innerHeight: HEIGHT - BORDER * 2
    }
  }, [viewMode, width])

  const restingSpeed = (): number => (prefersReducedMotion() ? 0 : SPEED_IDLE)

  useEffect(() => {
    if (!shaderRef.current) return
    shaderMount.current = new ShaderMount(
      shaderRef.current,
      liquidMetalFragmentShader,
      SHADER_UNIFORMS,
      undefined,
      restingSpeed()
    )
    const pending = timers.current
    return () => {
      pending.forEach((id) => window.clearTimeout(id))
      shaderMount.current?.dispose()
      shaderMount.current = null
    }
  }, [])

  const later = (fn: () => void, ms: number): void => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const handleMouseEnter = (): void => {
    hovered.current = true
    setIsHovered(true)
    if (!prefersReducedMotion()) shaderMount.current?.setSpeed(SPEED_HOVER)
  }

  const handleMouseLeave = (): void => {
    hovered.current = false
    setIsHovered(false)
    setIsPressed(false)
    shaderMount.current?.setSpeed(restingSpeed())
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (!prefersReducedMotion()) {
      shaderMount.current?.setSpeed(SPEED_CLICK)
      later(() => {
        shaderMount.current?.setSpeed(hovered.current ? SPEED_HOVER : restingSpeed())
      }, 300)
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      // Keyboard activation reports no pointer position: ripple from the centre instead.
      const keyboard = e.detail === 0
      const ripple = {
        x: keyboard ? rect.width / 2 : e.clientX - rect.left,
        y: keyboard ? rect.height / 2 : e.clientY - rect.top,
        id: rippleId.current++
      }
      setRipples((prev) => [...prev, ripple])
      later(() => setRipples((prev) => prev.filter((r) => r.id !== ripple.id)), 600)
    }

    onClick?.()
  }

  const layer = (z: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: dimensions.width,
    height: dimensions.height,
    transformStyle: 'preserve-3d',
    transition: `${EASE}, ${SIZE_EASE}`,
    ...extra,
    zIndex: z
  })

  const pressTransform = isPressed ? 'translateY(1px) scale(0.98)' : 'translateY(0) scale(1)'

  return (
    <div
      className={cn(
        'relative inline-block',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <div style={{ perspective: '1000px', perspectiveOrigin: '50% 50%' }}>
        <div
          style={{
            position: 'relative',
            width: dimensions.width,
            height: dimensions.height,
            transformStyle: 'preserve-3d',
            transition: `${EASE}, ${SIZE_EASE}`
          }}
        >
          {/* Label */}
          <div
            style={layer(30, {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transform: 'translateZ(20px)',
              pointerEvents: 'none'
            })}
          >
            {viewMode === 'icon' ? (
              <SparkleIcon
                size={18}
                weight="fill"
                style={{ color: '#f4f4f5', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))' }}
              />
            ) : (
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#f4f4f5',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
                  whiteSpace: 'nowrap'
                }}
              >
                {label}
              </span>
            )}
          </div>

          {/* Dark inner pill */}
          <div style={layer(20, { transform: `translateZ(10px) ${pressTransform}` })}>
            <div
              style={{
                width: dimensions.innerWidth,
                height: dimensions.innerHeight,
                margin: BORDER,
                borderRadius: 100,
                background: 'linear-gradient(180deg, #202020 0%, #000000 100%)',
                boxShadow: isPressed
                  ? 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(0, 0, 0, 0.3)'
                  : 'none',
                transition: `${EASE}, ${SIZE_EASE}, box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)`
              }}
            />
          </div>

          {/* Metal ring (shader) + drop shadow */}
          <div style={layer(10, { transform: `translateZ(0px) ${pressTransform}` })}>
            <div
              style={{
                width: dimensions.width,
                height: dimensions.height,
                borderRadius: 100,
                boxShadow: isPressed
                  ? '0 0 0 1px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.3)'
                  : isHovered
                    ? '0 0 0 1px rgba(0, 0, 0, 0.4), 0 12px 6px rgba(0, 0, 0, 0.05), 0 8px 5px rgba(0, 0, 0, 0.1), 0 4px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.2)'
                    : '0 0 0 1px rgba(0, 0, 0, 0.3), 0 36px 14px rgba(0, 0, 0, 0.02), 0 20px 12px rgba(0, 0, 0, 0.08), 0 9px 9px rgba(0, 0, 0, 0.12), 0 2px 5px rgba(0, 0, 0, 0.15)',
                transition: `${EASE}, ${SIZE_EASE}, box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)`
              }}
            >
              <div
                ref={shaderRef}
                className="liquid-metal-shader"
                style={{
                  borderRadius: 100,
                  overflow: 'hidden',
                  position: 'relative',
                  width: dimensions.width,
                  maxWidth: dimensions.width,
                  height: dimensions.height,
                  transition: SIZE_EASE
                }}
              />
            </div>
          </div>

          {/* Hit target */}
          <button
            ref={buttonRef}
            type={type}
            disabled={disabled}
            aria-label={label}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={() => setIsPressed(true)}
            onMouseUp={() => setIsPressed(false)}
            className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{
              ...layer(40, {
                background: 'transparent',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                outline: 'none',
                transform: 'translateZ(25px)',
                overflow: 'hidden',
                borderRadius: 100
              })
            }}
          >
            {ripples.map((ripple) => (
              <span
                key={ripple.id}
                style={{
                  position: 'absolute',
                  left: ripple.x,
                  top: ripple.y,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background:
                    'radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 70%)',
                  pointerEvents: 'none',
                  animation: 'liquid-metal-ripple 0.6s ease-out'
                }}
              />
            ))}
          </button>
        </div>
      </div>
    </div>
  )
}
