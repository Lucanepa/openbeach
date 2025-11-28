import jsPDF from 'jspdf'

/**
 * Generate a PDF scoresheet following official FIVB beach volleyball scoresheet format
 * Based on official FIVB beach volleyball scoresheet structure
 * 
 * Key sections per set:
 * - START TIME: Actual starting time of first serve (24-hour clock, 00:00)
 * - SERVICE ORDER: I, II, III, IV columns with boxes 1-21 for each player
 * - TEAM-POINTS row: Numbers 1-44, crossed off as points are scored
 * - COURT SWITCH SCORE box: Record scores at court switches (multiples of 7 for sets 1-2, multiples of 5 for set 3)
 * - Technical Timeout: Record in COURT SWITCH SCORE box at 21 points (sets 1-2 only)
 * - END TIME: Exact time when set finished
 */
export async function generateBeachScoresheetPDF(matchData) {
  const {
    match,
    homeTeam,
    awayTeam,
    homePlayers,
    awayPlayers,
    sets,
    events,
    referees,
    scorers
  } = matchData

  // Create PDF in landscape orientation (A4 landscape: 297mm x 210mm)
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  })

  // Constants for layout
  const pageWidth = 297
  const pageHeight = 210
  const margin = 8
  const contentWidth = pageWidth - (margin * 2)
  
  // Font sizes
  const fontSizeHeader = 10
  const fontSizeNormal = 8
  const fontSizeSmall = 7
  const fontSizeTiny = 6
  const fontSizeBox = 5

  // Starting position
  let yPos = margin
  const lineHeight = 4.5
  const smallLineHeight = 3.5

  // Helper function to draw a box with optional text
  const drawBox = (x, y, width, height, text = '', fontSize = fontSizeBox, align = 'center', fill = false, cross = false) => {
    pdf.setDrawColor(0, 0, 0)
    pdf.setLineWidth(0.1)
    if (fill) {
      pdf.setFillColor(0, 0, 0)
      pdf.rect(x, y, width, height, 'FD')
    } else {
      pdf.rect(x, y, width, height)
    }
    if (cross) {
      // Draw X through the box
      pdf.setLineWidth(0.2)
      pdf.line(x, y, x + width, y + height)
      pdf.line(x + width, y, x, y + height)
      pdf.setLineWidth(0.1)
    }
    if (text) {
      pdf.setFontSize(fontSize)
      pdf.setDrawColor(0, 0, 0)
      const textY = y + (height / 2) + (fontSize * 0.35)
      if (align === 'center') {
        pdf.text(text, x + width / 2, textY, { align: 'center' })
      } else if (align === 'left') {
        pdf.text(text, x + 1, textY, { align: 'left' })
      } else {
        pdf.text(text, x + width - 1, textY, { align: 'right' })
      }
    }
  }

  // Helper function to draw a circle
  const drawCircle = (x, y, radius, text = '', fontSize = fontSizeBox) => {
    pdf.setDrawColor(0, 0, 0)
    pdf.setLineWidth(0.1)
    pdf.circle(x + radius, y + radius, radius)
    if (text) {
      pdf.setFontSize(fontSize)
      const textY = y + radius + (fontSize * 0.35)
      pdf.text(text, x + radius, textY, { align: 'center' })
    }
  }

  // Determine team labels (A or B) based on coin toss
  const teamAKey = match.coinTossTeamA || 'team_1'
  const teamBKey = match.coinTossTeamB || 'team_2'
  const teamA = teamAKey === 'team_1' ? homeTeam : awayTeam
  const teamB = teamBKey === 'team_1' ? homeTeam : awayTeam
  const teamAPlayers = teamAKey === 'team_1' ? homePlayers : awayPlayers
  const teamBPlayers = teamBKey === 'team_1' ? homePlayers : awayPlayers

  // Get coin toss data
  const coinTossData = match.coinTossData || {}
  const coinTossWinner = coinTossData.coinTossWinner // 'teamA' | 'teamB'
  const set3CoinTossWinner = coinTossData.set3CoinTossWinner // 'teamA' | 'teamB' | null

  // HEADER SECTION
  pdf.setFontSize(fontSizeHeader)
  pdf.setFont(undefined, 'bold')
  pdf.text('OFFICIAL BEACH VOLLEYBALL SCORESHEET', pageWidth / 2, yPos, { align: 'center' })
  yPos += lineHeight + 1

  // Match information
  pdf.setFontSize(fontSizeSmall)
  pdf.setFont(undefined, 'normal')
  const matchDate = match.scheduledAt ? new Date(match.scheduledAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')
  const venue = match.site || match.venue || ''
  const city = match.city || ''
  const eventName = match.eventName || ''

  pdf.text(`Date: ${matchDate}`, margin, yPos)
  if (venue) pdf.text(`Venue: ${venue}`, margin + 50, yPos)
  if (city) pdf.text(`City: ${city}`, margin + 100, yPos)
  if (eventName) pdf.text(`Event: ${eventName}`, margin + 150, yPos)
  yPos += lineHeight

  // Teams section
  pdf.setFontSize(fontSizeNormal)
  pdf.setFont(undefined, 'bold')
  const teamBoxHeight = 7
  const teamBoxWidth = (contentWidth - 10) / 2
  
  // Team A
  drawBox(margin, yPos, teamBoxWidth, teamBoxHeight, `TEAM A: ${teamA?.name || 'Team A'}`, fontSizeNormal, 'left')
  
  // Team B
  drawBox(margin + teamBoxWidth + 10, yPos, teamBoxWidth, teamBoxHeight, `TEAM B: ${teamB?.name || 'Team B'}`, fontSizeNormal, 'left')
  yPos += teamBoxHeight + 3

  // Officials
  pdf.setFontSize(fontSizeSmall)
  pdf.setFont(undefined, 'normal')
  const ref1 = referees?.find(r => r.role === 'ref1') || referees?.[0]
  const ref2 = referees?.find(r => r.role === 'ref2') || referees?.[1]
  const scorer = scorers?.find(s => s.role === 'scorer') || scorers?.[0]

  if (ref1) pdf.text(`1st Referee: ${ref1.firstName || ''} ${ref1.lastName || ''}`, margin, yPos)
  if (ref2) pdf.text(`2nd Referee: ${ref2.firstName || ''} ${ref2.lastName || ''}`, margin + 100, yPos)
  yPos += lineHeight
  if (scorer) pdf.text(`Scorer: ${scorer.firstName || ''} ${scorer.lastName || ''}`, margin, yPos)
  yPos += lineHeight + 3

  // Sort sets by index
  const sortedSets = [...sets].sort((a, b) => a.index - b.index)
  const finishedSets = sortedSets.filter(s => s.finished)

  // For each set (1-3 for beach volleyball)
  for (let setIdx = 0; setIdx < 3; setIdx++) {
    const set = sortedSets.find(s => s.index === setIdx + 1)
    if (!set) continue

    const setEvents = events.filter(e => e.setIndex === (setIdx + 1)).sort((a, b) => {
      const aSeq = a.seq || 0
      const bSeq = b.seq || 0
      if (aSeq !== 0 || bSeq !== 0) return aSeq - bSeq
      return new Date(a.ts) - new Date(b.ts)
    })

    // Check if we need a new page
    if (yPos > pageHeight - 100) {
      pdf.addPage()
      yPos = margin
    }

    // SET HEADER
    pdf.setFontSize(fontSizeHeader)
    pdf.setFont(undefined, 'bold')
    pdf.text(`SET ${setIdx + 1}`, pageWidth / 2, yPos, { align: 'center' })
    yPos += lineHeight + 1

    // START TIME section (top of set)
    pdf.setFontSize(fontSizeSmall)
    pdf.setFont(undefined, 'normal')
    pdf.text('START TIME:', margin, yPos)
    const startTimeBoxWidth = 15
    const startTimeBoxHeight = 5
    const startTime = set.startTime ? new Date(set.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
    drawBox(margin + 25, yPos - 3, startTimeBoxWidth, startTimeBoxHeight, startTime, fontSizeSmall, 'center')
    yPos += lineHeight + 2

    // Get service order for this set
    const serviceOrder = set.serviceOrder || {}
    const firstServeTeam = match.firstServe || 'team_1'
    
    // Calculate service order mapping (I, II, III, IV)
    // I = Team A Player 1 (first serve), II = Team B Player 1 (first serve)
    // III = Team A Player 2, IV = Team B Player 2
    const teamAKey = match.coinTossTeamA || 'team_1'
    const teamBKey = match.coinTossTeamB || 'team_2'
    
    // Map service order numbers to I, II, III, IV
    // Service order 1 = I, 2 = II, 3 = III, 4 = IV
    const serviceOrderMap = {
      [`${teamAKey}_player1`]: serviceOrder[`${teamAKey}_player1`] === 1 ? 'I' : 'III',
      [`${teamAKey}_player2`]: serviceOrder[`${teamAKey}_player2`] === 1 ? 'I' : 'III',
      [`${teamBKey}_player1`]: serviceOrder[`${teamBKey}_player1`] === 2 ? 'II' : 'IV',
      [`${teamBKey}_player2`]: serviceOrder[`${teamBKey}_player2`] === 2 ? 'II' : 'IV'
    }
    
    // Track service order throughout the set
    // Service order: 1=I (Team A Player 1), 2=II (Team B Player 1), 3=III (Team A Player 2), 4=IV (Team B Player 2)
    let currentServiceOrderNum = 1 // 1=I, 2=II, 3=III, 4=IV
    let teamAScore = 0
    let teamBScore = 0
    let lastServingTeam = firstServeTeam
    
    // Determine initial service order based on first serve team
    // If Team A serves first, order starts at I (1)
    // If Team B serves first, order starts at II (2)
    if (firstServeTeam === teamBKey) {
      currentServiceOrderNum = 2 // Start at II
    }
    
    // Service tracking: { order: 'I'|'II'|'III'|'IV', team: 'A'|'B', pointsScored: number, boxNumber: number, teamScore: number }
    const serviceHistory = []
    let currentServiceBox = 1
    let currentServicePoints = 0
    let currentServiceOrderLabel = currentServiceOrderNum === 1 ? 'I' : 
                                   currentServiceOrderNum === 2 ? 'II' :
                                   currentServiceOrderNum === 3 ? 'III' : 'IV'
    let currentServiceTeam = firstServeTeam === teamAKey ? 'A' : 'B'
    
    // Process events chronologically to track service order
    for (const event of setEvents) {
      if (event.type === 'point') {
        const scoringTeam = event.payload?.team
        const isTeamA = scoringTeam === teamAKey
        
        if (isTeamA) {
          teamAScore++
        } else {
          teamBScore++
        }
        
        // If the serving team scored, they continue serving (same service order, same box)
        if (scoringTeam === lastServingTeam) {
          currentServicePoints++
        } else {
          // Service changed hands - record previous service
          if (currentServiceBox > 0 && currentServicePoints > 0) {
            serviceHistory.push({
              order: currentServiceOrderLabel,
              team: currentServiceTeam,
              pointsScored: currentServicePoints,
              boxNumber: currentServiceBox,
              teamScore: currentServiceTeam === 'A' ? teamAScore - 1 : teamBScore - 1 // Score before this point
            })
          }
          
          // Advance to next service order (I → II → III → IV → I...)
          currentServiceOrderNum = (currentServiceOrderNum % 4) + 1
          currentServiceOrderLabel = currentServiceOrderNum === 1 ? 'I' : 
                                     currentServiceOrderNum === 2 ? 'II' :
                                     currentServiceOrderNum === 3 ? 'III' : 'IV'
          
          // Determine which team is serving now based on service order
          // I and III = Team A, II and IV = Team B
          currentServiceTeam = (currentServiceOrderNum === 1 || currentServiceOrderNum === 3) ? 'A' : 'B'
          lastServingTeam = currentServiceTeam === 'A' ? teamAKey : teamBKey
          currentServiceBox++
          currentServicePoints = 1 // This point counts for the new service
        }
      }
    }
    
    // Record final service if set ended (even if receiving team won - circle score but don't cross box)
    if (set.finished) {
      const finalService = {
        order: currentServiceOrderLabel,
        team: currentServiceTeam,
        pointsScored: currentServicePoints,
        boxNumber: currentServiceBox,
        teamScore: currentServiceTeam === 'A' ? teamAScore : teamBScore,
        isReceivingTeamWin: false // Will be determined below
      }
      
      // Check if receiving team won (the team that didn't have serve won)
      const winningTeam = teamAScore > teamBScore ? 'A' : 'B'
      if (winningTeam !== currentServiceTeam) {
        finalService.isReceivingTeamWin = true
      }
      
      serviceHistory.push(finalService)
    }
    
    // SERVICE ORDER section (I, II, III, IV columns with boxes 1-21)
    pdf.setFontSize(fontSizeSmall)
    pdf.setFont(undefined, 'bold')
    pdf.text('SERVICE ORDER', margin, yPos)
    yPos += lineHeight + 1
    
    // Get player numbers for each team
    const teamAPlayer1 = teamAPlayers?.[0]?.number || 1
    const teamAPlayer2 = teamAPlayers?.[1]?.number || 2
    const teamBPlayer1 = teamBPlayers?.[0]?.number || 1
    const teamBPlayer2 = teamBPlayers?.[1]?.number || 2
    
    // Determine which player serves in which order based on serviceOrder
    const playerI = serviceOrder[`${teamAKey}_player1`] === 1 ? teamAPlayer1 : teamAPlayer2
    const playerII = serviceOrder[`${teamBKey}_player1`] === 2 ? teamBPlayer1 : teamBPlayer2
    const playerIII = serviceOrder[`${teamAKey}_player2`] === 3 ? teamAPlayer2 : teamAPlayer1
    const playerIV = serviceOrder[`${teamBKey}_player2`] === 4 ? teamBPlayer2 : teamBPlayer1
    
    // Column headers
    const serviceBoxSize = 3.5
    const serviceBoxSpacing = 4
    const serviceStartX = margin
    const serviceColumnWidth = 20
    const serviceRowHeight = 4
    
    // Draw column headers: I, II, III, IV with player numbers
    pdf.setFontSize(fontSizeTiny)
    pdf.setFont(undefined, 'bold')
    const headerY = yPos
    pdf.text(`I (${playerI})`, serviceStartX + serviceColumnWidth / 2, headerY, { align: 'center' })
    pdf.text(`II (${playerII})`, serviceStartX + serviceColumnWidth + serviceColumnWidth / 2, headerY, { align: 'center' })
    pdf.text(`III (${playerIII})`, serviceStartX + serviceColumnWidth * 2 + serviceColumnWidth / 2, headerY, { align: 'center' })
    pdf.text(`IV (${playerIV})`, serviceStartX + serviceColumnWidth * 3 + serviceColumnWidth / 2, headerY, { align: 'center' })
    yPos += lineHeight + 1
    
    // Draw boxes 1-21 for each column
    const serviceBoxY = yPos
    for (let boxNum = 1; boxNum <= 21; boxNum++) {
      const rowY = serviceBoxY + (boxNum - 1) * serviceRowHeight
      
      // Box number label on left
      pdf.setFontSize(fontSizeTiny)
      pdf.setFont(undefined, 'normal')
      pdf.text(boxNum.toString(), serviceStartX - 5, rowY + 2.5, { align: 'right' })
      
      // Draw boxes for each column (I, II, III, IV)
      for (let col = 0; col < 4; col++) {
        const boxX = serviceStartX + col * serviceColumnWidth + (serviceColumnWidth - serviceBoxSize) / 2
        const serviceRecord = serviceHistory.find(s => s.boxNumber === boxNum && 
          ((col === 0 && s.order === 'I') || 
           (col === 1 && s.order === 'II') || 
           (col === 2 && s.order === 'III') || 
           (col === 3 && s.order === 'IV')))
        
        if (serviceRecord) {
          if (serviceRecord.isReceivingTeamWin) {
            // Receiving team won - circle the score but don't cross the box
            drawCircle(boxX + serviceBoxSize / 2 - 1.5, rowY - 1.5, 1.5, serviceRecord.teamScore.toString(), fontSizeTiny)
            drawBox(boxX, rowY, serviceBoxSize, serviceBoxSize, '', fontSizeTiny) // Empty box (not crossed)
          } else {
            // Cross off the box number and record points scored
            drawBox(boxX, rowY, serviceBoxSize, serviceBoxSize, serviceRecord.pointsScored.toString(), fontSizeTiny, 'center', false, true)
          }
        } else {
          // Empty box
          drawBox(boxX, rowY, serviceBoxSize, serviceBoxSize, '', fontSizeTiny)
        }
      }
    }
    
    yPos += 21 * serviceRowHeight + lineHeight + 2
    
    // TEAM-POINTS row (1-44) - separate rows for Team A and Team B
    pdf.setFontSize(fontSizeSmall)
    pdf.setFont(undefined, 'bold')
    pdf.text('TEAM - POINTS', margin, yPos)
    yPos += lineHeight + 1
    
    const pointsBoxSize = 3
    const pointsBoxSpacing = 3.5
    const pointsStartX = margin + 15
    const pointsRowHeight = 4
    
    // Team A points row
    pdf.setFontSize(fontSizeTiny)
    pdf.setFont(undefined, 'normal')
    pdf.text('Team A:', margin, yPos + 2)
    const teamARowY = yPos
    for (let i = 1; i <= 44; i++) {
      const boxX = pointsStartX + (i - 1) * pointsBoxSpacing
      if (i <= teamAScore) {
        // Cross off the number
        drawBox(boxX, teamARowY, pointsBoxSize, pointsBoxSize, i.toString(), fontSizeTiny, 'center', false, true)
      } else if (set.finished) {
        // Cancel unused boxes at end of set
        drawBox(boxX, teamARowY, pointsBoxSize, pointsBoxSize, '', fontSizeTiny, 'center', false, true)
      } else {
        // Empty box
        drawBox(boxX, teamARowY, pointsBoxSize, pointsBoxSize, '', fontSizeTiny)
      }
    }
    yPos += pointsRowHeight + 1
    
    // Team B points row
    pdf.text('Team B:', margin, yPos + 2)
    const teamBRowY = yPos
    for (let i = 1; i <= 44; i++) {
      const boxX = pointsStartX + (i - 1) * pointsBoxSpacing
      if (i <= teamBScore) {
        // Cross off the number
        drawBox(boxX, teamBRowY, pointsBoxSize, pointsBoxSize, i.toString(), fontSizeTiny, 'center', false, true)
      } else if (set.finished) {
        // Cancel unused boxes at end of set
        drawBox(boxX, teamBRowY, pointsBoxSize, pointsBoxSize, '', fontSizeTiny, 'center', false, true)
      } else {
        // Empty box
        drawBox(boxX, teamBRowY, pointsBoxSize, pointsBoxSize, '', fontSizeTiny)
      }
    }
    
    yPos += pointsRowHeight + lineHeight + 2
    
    // COURT SWITCH SCORE section
    pdf.setFontSize(fontSizeSmall)
    pdf.setFont(undefined, 'bold')
    pdf.text('COURT SWITCH SCORE', margin, yPos)
    yPos += lineHeight + 1
    
    // Track court switches (multiples of 7 for sets 1-2, multiples of 5 for set 3)
    const isSet3 = setIdx === 2
    const switchInterval = isSet3 ? 5 : 7
    const courtSwitches = []
    let totalPoints = 0
    let teamAScoreAtPoint = 0
    let teamBScoreAtPoint = 0
    
    for (const event of setEvents) {
      if (event.type === 'point') {
        totalPoints++
        const scoringTeam = event.payload?.team
        if (scoringTeam === teamAKey) {
          teamAScoreAtPoint++
        } else {
          teamBScoreAtPoint++
        }
        
        // Only count court switches (not TTO at 21 points)
        if (totalPoints % switchInterval === 0 && totalPoints > 0 && totalPoints !== 21) {
          courtSwitches.push({
            totalPoints,
            teamAScore: teamAScoreAtPoint,
            teamBScore: teamBScoreAtPoint
          })
        }
      }
    }
    
    // Draw court switch score boxes
    const switchBoxWidth = 12
    const switchBoxHeight = 5
    const switchBoxSpacing = 2
    const switchStartX = margin
    
    for (let i = 0; i < 10; i++) { // Up to 10 court switches
      const switchX = switchStartX + i * (switchBoxWidth + switchBoxSpacing)
      const switchRecord = courtSwitches[i]
      
      if (switchRecord) {
        // Record scores: Team A (left), Team B (right)
        drawBox(switchX, yPos, switchBoxWidth / 2 - 0.5, switchBoxHeight, switchRecord.teamAScore.toString(), fontSizeTiny, 'center')
        drawBox(switchX + switchBoxWidth / 2 + 0.5, yPos, switchBoxWidth / 2 - 0.5, switchBoxHeight, switchRecord.teamBScore.toString(), fontSizeTiny, 'center')
      } else {
        // Empty boxes (cross off if set ended)
        if (set.finished) {
          drawBox(switchX, yPos, switchBoxWidth, switchBoxHeight, '', fontSizeTiny, 'center', false, true)
        } else {
          drawBox(switchX, yPos, switchBoxWidth, switchBoxHeight, '', fontSizeTiny)
        }
      }
    }
    
    yPos += switchBoxHeight + lineHeight + 2
    
    // TTO (TECHNICAL TIMEOUT) section (sets 1-2 only, at 21 points)
    if (!isSet3) {
      pdf.setFontSize(fontSizeSmall)
      pdf.setFont(undefined, 'bold')
      pdf.text('TTO', margin, yPos)
      yPos += lineHeight + 1
      
      // Check for Technical Timeout (sets 1-2 only, at 21 points)
      let hasTTO = false
      let ttoTeamAScore = 0
      let ttoTeamBScore = 0
      const ttoEvent = setEvents.find(e => e.type === 'technical_timeout' || 
        (e.type === 'point' && setEvents.filter(pe => pe.type === 'point').length === 21))
      if (ttoEvent) {
        hasTTO = true
        // Calculate scores at TTO (21st point)
        let pointsAtTTO = 0
        for (const event of setEvents) {
          if (event.type === 'point') {
            pointsAtTTO++
            const scoringTeam = event.payload?.team
            if (scoringTeam === teamAKey) {
              ttoTeamAScore++
            } else {
              ttoTeamBScore++
            }
            if (pointsAtTTO === 21) break
          }
        }
      }
      
      // Draw TTO score box
      const ttoBoxWidth = 12
      const ttoBoxHeight = 5
      const ttoX = margin
      
      if (hasTTO) {
        // Record scores: Team A (left), Team B (right)
        drawBox(ttoX, yPos, ttoBoxWidth / 2 - 0.5, ttoBoxHeight, ttoTeamAScore.toString(), fontSizeTiny, 'center')
        drawBox(ttoX + ttoBoxWidth / 2 + 0.5, yPos, ttoBoxWidth / 2 - 0.5, ttoBoxHeight, ttoTeamBScore.toString(), fontSizeTiny, 'center')
      } else {
        // Empty box (cross off if set ended)
        if (set.finished) {
          drawBox(ttoX, yPos, ttoBoxWidth, ttoBoxHeight, '', fontSizeTiny, 'center', false, true)
        } else {
          drawBox(ttoX, yPos, ttoBoxWidth, ttoBoxHeight, '', fontSizeTiny)
        }
      }
      
      yPos += ttoBoxHeight + lineHeight + 2
    }

    // END TIME section (right side of set)
    pdf.setFontSize(fontSizeSmall)
    pdf.setFont(undefined, 'normal')
    pdf.text('END TIME:', pageWidth - margin - 50, yPos - lineHeight - 2)
    const endTime = set.endTime ? new Date(set.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
    drawBox(pageWidth - margin - 25, yPos - lineHeight - 5, startTimeBoxWidth, startTimeBoxHeight, endTime, fontSizeSmall, 'center')

    // Final score
    if (set.finished) {
      pdf.setFontSize(fontSizeSmall)
      pdf.setFont(undefined, 'normal')
      const homePoints = teamAKey === 'team_1' ? set.homePoints : set.awayPoints
      const awayPoints = teamAKey === 'team_1' ? set.awayPoints : set.homePoints
      pdf.text(`Final: Team A ${homePoints} - Team B ${awayPoints}`, pageWidth / 2, yPos, { align: 'center' })
      yPos += lineHeight
    }

    yPos += 5 // Space between sets
  }

  // Final match result
  if (finishedSets.length > 0) {
    if (yPos > pageHeight - 50) {
      pdf.addPage()
      yPos = margin
    }

    pdf.setFontSize(fontSizeHeader)
    pdf.setFont(undefined, 'bold')
    pdf.text('MATCH RESULT', pageWidth / 2, yPos, { align: 'center' })
    yPos += lineHeight + 2

    const homeSetsWon = finishedSets.filter(s => {
      const homePoints = teamAKey === 'team_1' ? s.homePoints : s.awayPoints
      const awayPoints = teamAKey === 'team_1' ? s.awayPoints : s.homePoints
      return homePoints > awayPoints
    }).length

    const awaySetsWon = finishedSets.filter(s => {
      const homePoints = teamAKey === 'team_1' ? s.homePoints : s.awayPoints
      const awayPoints = teamAKey === 'team_1' ? s.awayPoints : s.homePoints
      return awayPoints > homePoints
    }).length

    pdf.setFontSize(fontSizeHeader)
    pdf.text(`Team A ${homeSetsWon} - Team B ${awaySetsWon}`, pageWidth / 2, yPos, { align: 'center' })
    yPos += lineHeight + 2
  }

  // Signatures section
  if (yPos > pageHeight - 60) {
    pdf.addPage()
    yPos = margin
  }

  pdf.setFontSize(fontSizeHeader)
  pdf.setFont(undefined, 'bold')
  pdf.text('SIGNATURES', pageWidth / 2, yPos, { align: 'center' })
  yPos += lineHeight + 2

  const signatureBoxHeight = 12
  const signatureBoxWidth = 55
  const signatureSpacing = 12

  // Captains
  pdf.setFontSize(fontSizeSmall)
  pdf.setFont(undefined, 'normal')
  pdf.text('Team A Captain:', margin, yPos)
  if (match.homeCaptainSignature || match.postMatchSignatureHomeCaptain) {
    const sig = match.postMatchSignatureHomeCaptain || match.homeCaptainSignature
    pdf.addImage(sig, 'PNG', margin, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  } else {
    drawBox(margin, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  }
  yPos += signatureBoxHeight + 4

  pdf.text('Team B Captain:', margin, yPos)
  if (match.awayCaptainSignature || match.postMatchSignatureAwayCaptain) {
    const sig = match.postMatchSignatureAwayCaptain || match.awayCaptainSignature
    pdf.addImage(sig, 'PNG', margin, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  } else {
    drawBox(margin, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  }
  yPos += signatureBoxHeight + 5

  // Officials
  pdf.text('1st Referee:', margin, yPos)
  if (match.ref1Signature) {
    pdf.addImage(match.ref1Signature, 'PNG', margin, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  } else {
    drawBox(margin, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  }

  pdf.text('2nd Referee:', margin + signatureBoxWidth + signatureSpacing, yPos)
  if (match.ref2Signature) {
    pdf.addImage(match.ref2Signature, 'PNG', margin + signatureBoxWidth + signatureSpacing, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  } else {
    drawBox(margin + signatureBoxWidth + signatureSpacing, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  }
  yPos += signatureBoxHeight + 4

  pdf.text('Scorer:', margin, yPos)
  if (match.scorerSignature) {
    pdf.addImage(match.scorerSignature, 'PNG', margin, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  } else {
    drawBox(margin, yPos + 2, signatureBoxWidth, signatureBoxHeight)
  }

  // Generate filename
  const filename = `BeachScoresheet_${(teamA?.name || 'TeamA').replace(/[^a-zA-Z0-9]/g, '_')}_vs_${(teamB?.name || 'TeamB').replace(/[^a-zA-Z0-9]/g, '_')}_${matchDate.replace(/\//g, '-')}.pdf`

  // Save PDF
  pdf.save(filename)
}

