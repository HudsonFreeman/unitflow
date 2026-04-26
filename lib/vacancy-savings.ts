export function calculateVacancySavings({
    monthlyRent,
    leaseEndDate,
    moveInDate,
  }: {
    monthlyRent: number | null
    leaseEndDate: string | null
    moveInDate: string | null
  }) {
    if (!leaseEndDate || !moveInDate) {
      return {
        without: null,
        with: null,
        saved: null,
        revenue: null,
        hasRevenue: false,
      }
    }
  
    const leaseEnd = new Date(leaseEndDate)
    const moveIn = new Date(moveInDate)
  
    const MS_PER_DAY = 1000 * 60 * 60 * 24
  
    const without = Math.max(
      0,
      Math.ceil((moveIn.getTime() - leaseEnd.getTime()) / MS_PER_DAY)
    )
  
    const turnoverBuffer = 2
    const withTransfer = turnoverBuffer
  
    const saved = Math.max(0, without - withTransfer)
  
    if (!monthlyRent) {
      return {
        without,
        with: withTransfer,
        saved,
        revenue: null,
        hasRevenue: false,
      }
    }
  
    const daily = monthlyRent / 30
    const revenue = Number((saved * daily).toFixed(2))
  
    return {
      without,
      with: withTransfer,
      saved,
      revenue,
      hasRevenue: true,
    }
  }