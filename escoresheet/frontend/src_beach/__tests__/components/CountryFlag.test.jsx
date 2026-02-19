import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import CountryFlag from '../../components_beach/CountryFlag_beach'

describe('CountryFlag_beach', () => {
  describe('rendering', () => {
    it('should render a span element for valid country code', () => {
      const { container } = render(<CountryFlag countryCode="USA" />)
      const span = container.querySelector('span')
      expect(span).toBeInTheDocument()
    })

    it('should return null for null country code', () => {
      const { container } = render(<CountryFlag countryCode={null} />)
      expect(container.firstChild).toBeNull()
    })

    it('should return null for undefined country code', () => {
      const { container } = render(<CountryFlag />)
      expect(container.firstChild).toBeNull()
    })

    it('should return null for empty string country code', () => {
      const { container } = render(<CountryFlag countryCode="" />)
      expect(container.firstChild).toBeNull()
    })

    it('should return null for invalid country code', () => {
      const { container } = render(<CountryFlag countryCode="ZZZ" />)
      expect(container.firstChild).toBeNull()
    })
  })

  describe('ISO3 to ISO2 conversion', () => {
    it('should convert USA to us', () => {
      const { container } = render(<CountryFlag countryCode="USA" />)
      const span = container.querySelector('span')
      expect(span.className).toContain('fi-us')
    })

    it('should convert CHE to ch', () => {
      const { container } = render(<CountryFlag countryCode="CHE" />)
      const span = container.querySelector('span')
      expect(span.className).toContain('fi-ch')
    })

    it('should convert DEU to de', () => {
      const { container } = render(<CountryFlag countryCode="DEU" />)
      const span = container.querySelector('span')
      expect(span.className).toContain('fi-de')
    })

    it('should convert FRA to fr', () => {
      const { container } = render(<CountryFlag countryCode="FRA" />)
      const span = container.querySelector('span')
      expect(span.className).toContain('fi-fr')
    })

    it('should convert ITA to it', () => {
      const { container } = render(<CountryFlag countryCode="ITA" />)
      const span = container.querySelector('span')
      expect(span.className).toContain('fi-it')
    })

    it('should handle lowercase input', () => {
      const { container } = render(<CountryFlag countryCode="usa" />)
      const span = container.querySelector('span')
      expect(span.className).toContain('fi-us')
    })

    it('should apply fi base class', () => {
      const { container } = render(<CountryFlag countryCode="USA" />)
      const span = container.querySelector('span')
      expect(span.className).toContain('fi')
    })
  })

  describe('size prop', () => {
    it('should default to sm size (16px)', () => {
      const { container } = render(<CountryFlag countryCode="USA" />)
      const span = container.querySelector('span')
      expect(span).toHaveStyle({ fontSize: '16px' })
    })

    it('should render xs size (12px)', () => {
      const { container } = render(<CountryFlag countryCode="USA" size="xs" />)
      const span = container.querySelector('span')
      expect(span).toHaveStyle({ fontSize: '12px' })
    })

    it('should render md size (20px)', () => {
      const { container } = render(<CountryFlag countryCode="USA" size="md" />)
      const span = container.querySelector('span')
      expect(span).toHaveStyle({ fontSize: '20px' })
    })

    it('should render lg size (24px)', () => {
      const { container } = render(<CountryFlag countryCode="USA" size="lg" />)
      const span = container.querySelector('span')
      expect(span).toHaveStyle({ fontSize: '24px' })
    })

    it('should fallback to sm for unknown size', () => {
      const { container } = render(<CountryFlag countryCode="USA" size="xxl" />)
      const span = container.querySelector('span')
      expect(span).toHaveStyle({ fontSize: '16px' })
    })
  })

  describe('title attribute', () => {
    it('should set title to the original country code', () => {
      const { container } = render(<CountryFlag countryCode="USA" />)
      const span = container.querySelector('span')
      expect(span.getAttribute('title')).toBe('USA')
    })
  })

  describe('custom style', () => {
    it('should merge custom styles', () => {
      const { container } = render(
        <CountryFlag countryCode="USA" style={{ marginRight: '8px' }} />
      )
      const span = container.querySelector('span')
      expect(span).toHaveStyle({ marginRight: '8px' })
      // Should also retain base styles
      expect(span).toHaveStyle({ borderRadius: '2px' })
    })
  })
})
