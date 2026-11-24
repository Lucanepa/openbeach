import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DonutCountdown from '../../components_beach/DonutCountdown_beach'

describe('DonutCountdown_beach', () => {
  describe('rendering', () => {
    it('should render with default size', () => {
      const { container } = render(
        <DonutCountdown current={15} total={30}>
          <span>15s</span>
        </DonutCountdown>
      )
      const wrapper = container.firstChild
      expect(wrapper).toHaveStyle({ width: '120px', height: '120px' })
    })

    it('should render with custom size', () => {
      const { container } = render(
        <DonutCountdown current={15} total={30} size={200}>
          <span>15s</span>
        </DonutCountdown>
      )
      const wrapper = container.firstChild
      expect(wrapper).toHaveStyle({ width: '200px', height: '200px' })
    })

    it('should render children in center', () => {
      const { container } = render(
        <DonutCountdown current={15} total={30}>
          <span data-testid="center">15s</span>
        </DonutCountdown>
      )
      expect(container.querySelector('[data-testid="center"]')).toBeInTheDocument()
    })

    it('should render SVG element', () => {
      const { container } = render(
        <DonutCountdown current={15} total={30}>
          <span>15s</span>
        </DonutCountdown>
      )
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('should render two circle elements (background + progress)', () => {
      const { container } = render(
        <DonutCountdown current={15} total={30}>
          <span>15s</span>
        </DonutCountdown>
      )
      const circles = container.querySelectorAll('circle')
      expect(circles.length).toBe(2)
    })
  })

  describe('SVG dimensions', () => {
    it('should set SVG width and height to size', () => {
      const { container } = render(
        <DonutCountdown current={15} total={30} size={150}>
          <span>15s</span>
        </DonutCountdown>
      )
      const svg = container.querySelector('svg')
      expect(svg.getAttribute('width')).toBe('150')
      expect(svg.getAttribute('height')).toBe('150')
    })
  })

  describe('progress calculation', () => {
    it('should show full ring when current equals total', () => {
      const { container } = render(
        <DonutCountdown current={30} total={30} size={120} strokeWidth={8}>
          <span>30s</span>
        </DonutCountdown>
      )
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      // At 100% progress, offset should be 0
      const offset = parseFloat(progressCircle.getAttribute('stroke-dashoffset'))
      expect(offset).toBeCloseTo(0, 1)
    })

    it('should show empty ring when current is 0', () => {
      const { container } = render(
        <DonutCountdown current={0} total={30} size={120} strokeWidth={8}>
          <span>0s</span>
        </DonutCountdown>
      )
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      const dasharray = parseFloat(progressCircle.getAttribute('stroke-dasharray'))
      const offset = parseFloat(progressCircle.getAttribute('stroke-dashoffset'))
      // At 0% progress, offset should equal circumference
      expect(offset).toBeCloseTo(dasharray, 1)
    })

    it('should show half ring at 50% progress', () => {
      const { container } = render(
        <DonutCountdown current={15} total={30} size={120} strokeWidth={8}>
          <span>15s</span>
        </DonutCountdown>
      )
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      const dasharray = parseFloat(progressCircle.getAttribute('stroke-dasharray'))
      const offset = parseFloat(progressCircle.getAttribute('stroke-dashoffset'))
      // At 50%, offset should be half the circumference
      expect(offset).toBeCloseTo(dasharray / 2, 1)
    })
  })

  describe('edge cases', () => {
    it('should clamp progress to 0 for negative current', () => {
      const { container } = render(
        <DonutCountdown current={-5} total={30} size={120} strokeWidth={8}>
          <span>-5s</span>
        </DonutCountdown>
      )
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      const dasharray = parseFloat(progressCircle.getAttribute('stroke-dasharray'))
      const offset = parseFloat(progressCircle.getAttribute('stroke-dashoffset'))
      // Clamped to 0%, offset should equal circumference
      expect(offset).toBeCloseTo(dasharray, 1)
    })

    it('should clamp progress to 1 for current exceeding total', () => {
      const { container } = render(
        <DonutCountdown current={50} total={30} size={120} strokeWidth={8}>
          <span>50s</span>
        </DonutCountdown>
      )
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      const offset = parseFloat(progressCircle.getAttribute('stroke-dashoffset'))
      // Clamped to 100%, offset should be 0
      expect(offset).toBeCloseTo(0, 1)
    })
  })

  describe('custom strokeWidth', () => {
    it('should calculate correct radius with custom strokeWidth', () => {
      const size = 120
      const strokeWidth = 12
      const expectedRadius = (size - strokeWidth) / 2

      const { container } = render(
        <DonutCountdown current={15} total={30} size={size} strokeWidth={strokeWidth}>
          <span>15s</span>
        </DonutCountdown>
      )
      const circles = container.querySelectorAll('circle')
      const radius = parseFloat(circles[0].getAttribute('r'))
      expect(radius).toBe(expectedRadius)
    })
  })
})
