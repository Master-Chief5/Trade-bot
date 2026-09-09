const pptxgen = require('pptxgenjs');
const { icon, bg } = require('./assets');
const L = require('./links.json');
const link = p => { for (const k in L) if (k.includes(p)) return L[k]; throw new Error('link ' + p); };

// ---- palette ----
const C = { bg:'0A0F1C', card:'111A2E', card2:'0D1526', line:'23304A', green:'00E5A0', cyan:'38BDF8', amber:'FBBF24', rose:'FB7185', text:'F1F5F9', muted:'9FB0C8', dim:'5B6B85', white:'FFFFFF' };
const H = 'Arial', B = 'Arial', M = 'Courier New';
const W = 13.333, HT = 7.5;
const TOTAL = 12;

(async () => {
  const BG_T = await bg('title'), BG_C = await bg('content');
  const ic = {};
  const want = [['FaShieldAlt',C.green],['FaUserSecret',C.green],['FaMagic',C.green],['FaCode',C.green],['FaGamepad',C.green],['FaServer',C.green],['FaMobileAlt',C.green],['FaBug',C.green],
    ['FaBriefcase',C.cyan],['FaMapMarkerAlt',C.cyan],['FaLink',C.cyan],['FaCrosshairs',C.cyan],
    ['FaGraduationCap',C.green],['FaTerminal',C.green],['FaTools',C.green],['FaHourglassHalf',C.green],
    ['FaDollarSign',C.green],['FaChartLine',C.green],['FaGlobeAmericas',C.green],['FaHeart',C.green],['FaThumbsDown',C.rose],
    ['FaUniversity',C.cyan],['FaBed',C.cyan],['FaUtensils',C.cyan],['FaClipboardCheck',C.cyan],['FaTrophy',C.cyan],['FaExternalLinkAlt',C.cyan],
    ['FaRobot',C.green],['FaNewspaper',C.green],['FaBrain',C.green],['FaComment',C.green],['FaCalendarAlt',C.green],['FaStickyNote',C.green],['FaSearch',C.cyan]];
  for (const [n,c] of want) ic[n] = await icon(n, c);
  const icDark = { FaShieldAlt: await icon('FaShieldAlt', C.bg), FaCheck: await icon('FaCheck', C.bg) };

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'Nathaniel Hatendi';
  pres.title = 'Career Research';

  // ---- helpers ----
  const shadow = () => ({ type:'outer', color:'000000', blur:14, offset:5, angle:90, opacity:0.45 });
  const glow = () => ({ type:'outer', color:C.green, blur:20, offset:0, angle:90, opacity:0.35 });
  function base(kind='content') {
    const s = pres.addSlide();
    s.background = { data: kind==='title' ? BG_T : BG_C };
    return s;
  }
  function pageNum(s, n) {
    s.addText(String(n).padStart(2,'0') + ' / ' + TOTAL, { x: W-2.0, y: HT-0.5, w: 1.5, h: 0.3, align:'right', fontFace:M, fontSize:10, color:C.dim, isTextBox:true, margin:0 });
    s.addImage({ data: icDark.FaShieldAlt, x: 0.5, y: HT-0.47, w:0.22, h:0.22, transparency: 0 });
    s.addShape(pres.shapes.OVAL, { x:0.47, y:HT-0.5, w:0.28, h:0.28, fill:{ color:C.green }, line:{ color:C.green, width:0 } });
    s.addImage({ data: icDark.FaShieldAlt, x: 0.53, y: HT-0.44, w:0.16, h:0.16 });
    s.addText('CAREER RESEARCH', { x:0.85, y:HT-0.5, w:3, h:0.28, fontFace:M, fontSize:9, color:C.dim, isTextBox:true, margin:0, valign:'middle', charSpacing:2 });
  }
  function header(s, kicker, title, opts={}) {
    s.addText(kicker, { x:0.6, y:0.42, w:8, h:0.3, fontFace:M, fontSize:11, color:C.green, isTextBox:true, margin:0, charSpacing:3 });
    s.addText(title, { x:0.6, y:0.72, w: opts.w || 11.5, h: opts.h || 0.8, fontFace:H, fontSize: opts.size || 32, bold:true, color:C.white, isTextBox:true, margin:0, valign:'top' });
  }
  function card(s, x, y, w, h, o={}) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius:0.14, fill:{ color: o.fill || C.card }, line:{ color: o.line || C.line, width: o.lw || 0.75 }, shadow: o.glow ? glow() : shadow() });
  }
  function iconCircle(s, x, y, d, name, color) {
    s.addShape(pres.shapes.OVAL, { x, y, w:d, h:d, fill:{ color: color || C.green, transparency: 82 }, line:{ color: color || C.green, width:0.75, transparency: 40 } });
    const p = d*0.27;
    s.addImage({ data: ic[name], x:x+p, y:y+p, w:d-2*p, h:d-2*p });
  }
  const label = (t, extra={}) => ({ text: t, options: { fontFace:M, fontSize:10.5, color:C.cyan, charSpacing:1, ...extra } });
  const body = (t, extra={}) => ({ text: t, options: { fontFace:B, fontSize:14, color:C.text, ...extra } });
  const src = (t, url, extra={}) => ({ text: t, options: { fontFace:M, fontSize:9.5, color:C.green, hyperlink:{ url }, ...extra } });
  const br = (o) => ({ ...o, options: { ...o.options, breakLine:true } });
  function tb(s, runs, x, y, w, h, extra={}) {
    s.addText(runs, { x, y, w, h, isTextBox:true, margin:0, valign:'top', paraSpaceAfter:4, ...extra });
  }

  // =====================================================================
  // 1. TITLE
  // =====================================================================
  {
    const s = base('title');
    s.addShape(pres.shapes.OVAL, { x:9.35, y:1.55, w:2.9, h:2.9, fill:{ color:C.green, transparency:88 }, line:{ color:C.green, width:1.5, transparency:30 }, shadow: glow() });
    s.addShape(pres.shapes.OVAL, { x:9.75, y:1.95, w:2.1, h:2.1, fill:{ color:C.green, transparency:70 }, line:{ color:C.green, width:0 } });
    s.addImage({ data: ic.FaShieldAlt, x:10.2, y:2.4, w:1.2, h:1.2 });
    s.addText('// U1-1 · CAREER RESEARCH', { x:0.8, y:1.5, w:8, h:0.35, fontFace:M, fontSize:12, color:C.green, charSpacing:4, isTextBox:true, margin:0 });
    s.addText('Career Research', { x:0.8, y:1.9, w:8.4, h:1.3, fontFace:H, fontSize:64, bold:true, color:C.white, isTextBox:true, margin:0, valign:'middle' });
    // three sub-lines as terminal-style chips
    const lines = ['Slides Due Sep 11', 'Present Sep 11', 'Add Reference in the notes section…'];
    const icons = ['FaCalendarAlt', 'FaComment', 'FaStickyNote'];
    lines.forEach((t, i) => {
      const y = 3.45 + i*0.62;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:0.8, y, w:5.6, h:0.5, rectRadius:0.25, fill:{ color:C.card, transparency:20 }, line:{ color:C.line, width:0.75 } });
      s.addShape(pres.shapes.OVAL, { x:0.9, y:y+0.08, w:0.34, h:0.34, fill:{ color:C.green, transparency:80 }, line:{ color:C.green, width:0 } });
      s.addImage({ data: ic[icons[i]], x:0.98, y:y+0.16, w:0.18, h:0.18 });
      s.addText(t, { x:1.38, y, w:4.9, h:0.5, fontFace:B, fontSize:16, color:C.text, isTextBox:true, margin:0, valign:'middle' });
    });
    s.addText([{ text:'By:', options:{ fontFace:M, fontSize:14, color:C.muted, charSpacing:2 } }], { x:0.8, y:5.75, w:1.0, h:0.45, isTextBox:true, margin:0, valign:'middle' });
    s.addShape(pres.shapes.LINE, { x:1.5, y:6.12, w:4.0, h:0, line:{ color:C.green, width:1.25, dashType:'dash' } });
    s.addText('OFFENSIVE SECURITY · ONTARIO TECH · EMERGING TECHNOLOGY', { x:0.8, y:HT-0.55, w:9, h:0.3, fontFace:M, fontSize:9, color:C.dim, charSpacing:3, isTextBox:true, margin:0 });
    s.addNotes(`References (sources cited in this presentation):
- Job posting: Workopolis — https://www.workopolis.com/search?q=penetration+testing&l=toronto%2C+on
- Cyber Degrees — ${link('CAESbQHr')}
- Reddit Computer Science Careers — ${link('CAESogEB')}
- Cyber Degrees Hard Skills Guide
- Morgan McKinley Salary Guide — ${link('CAEShgEB')}
- HackerDNA Salary Breakdown — ${link('CAESbAHr')}
- Linkedin — ${link('CAESnQEB')}
- Ontario Tech University — ${link('CAESUAHr')} / https://ontariotechu.ca
- Ontario Tech Residence Rates — https://ontariotechuresidence.ca/residence-rates/
- Ontario Tech Meal Plans — https://ontariotechuresidence.ca/meal-plans/
- Ontario Tech Academic Calendar — https://calendar.ontariotechu.ca/preview_{p}rogram.php?catoid=67&poid=14513
- Uniscope Ontario Tech Overview — https://uniscope.ca/ontario-tech-university
- Ontario Tech University Program Calendar Guide — ${link('CAESgQEB')}
- "AI Is at a Turning Point" — ${link('CAESdQHr')}`);
    s.addText('01 / ' + TOTAL, { x:W-2.0, y:HT-0.55, w:1.5, h:0.3, align:'right', fontFace:M, fontSize:10, color:C.dim, isTextBox:true, margin:0 });
  }

  // =====================================================================
  // 2. JOB LIST
  // =====================================================================
  {
    const s = base();
    header(s, '// 02  JOBS THAT REQUIRE PROGRAMMING', 'Make a list of at least 7 jobs that require programming', { size:30 });
    const jobs = [['Hacking','FaUserSecret'],['Vibe coder','FaMagic'],['Offensive Security Consultant','FaShieldAlt'],['Software dev','FaCode'],['Game dev','FaGamepad'],['Systems Administrator','FaServer'],['App dev','FaMobileAlt']];
    const cw = 2.85, ch = 1.75, gx = 0.3, gy = 0.3, x0 = 0.6, y0 = 1.85;
    jobs.forEach(([t, i], k) => {
      const col = k % 4, row = Math.floor(k/4);
      const x = x0 + col*(cw+gx), y = y0 + row*(ch+gy);
      const chosen = k === 2;
      card(s, x, y, cw, ch, chosen ? { fill:'0F2A26', line:C.green, lw:1.5, glow:true } : {});
      iconCircle(s, x+0.22, y+0.22, 0.6, i);
      s.addText(String(k+1).padStart(2,'0'), { x:x+cw-0.8, y:y+0.18, w:0.6, h:0.35, align:'right', fontFace:M, fontSize:13, color: chosen ? C.green : C.dim, isTextBox:true, margin:0 });
      s.addText(t, { x:x+0.22, y:y+0.95, w:cw-0.4, h:0.65, fontFace:H, fontSize: t.length > 20 ? 15 : 17, bold:true, color:C.white, isTextBox:true, margin:0, valign:'top' });
    });
    // 8th cell: the instruction line
    const x = x0 + 3*(cw+gx), y = y0 + ch + gy;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w:cw, h:ch, rectRadius:0.14, fill:{ color:C.green, transparency:88 }, line:{ color:C.green, width:1, dashType:'dash' } });
    s.addImage({ data: ic.FaCrosshairs, x:x+0.22, y:y+0.22, w:0.42, h:0.42 });
    s.addText('Choose one of the jobs in your list and find an entry level job posting.', { x:x+0.22, y:y+0.72, w:cw-0.44, h:0.95, fontFace:B, fontSize:13, color:C.text, isTextBox:true, margin:0, valign:'top', italic:true });
    pageNum(s, 2);
  }

  // =====================================================================
  // 3. JOB POSTING
  // =====================================================================
  {
    const s = base();
    header(s, '// 03  ENTRY LEVEL POSTING', 'Job Posting');
    // left hero card
    card(s, 0.6, 1.8, 6.1, 4.9);
    iconCircle(s, 0.95, 2.15, 0.9, 'FaBriefcase', C.cyan);
    tb(s, [label('1.  Job Title:')], 2.05, 2.2, 4.5, 0.3);
    s.addText('Offensive Security Consultant', { x:2.05, y:2.48, w:4.5, h:0.9, fontFace:H, fontSize:24, bold:true, color:C.white, isTextBox:true, margin:0, valign:'top' });
    s.addShape(pres.shapes.LINE, { x:0.95, y:3.55, w:5.4, h:0, line:{ color:C.line, width:0.75 } });
    iconCircle(s, 0.95, 3.85, 0.6, 'FaMapMarkerAlt', C.cyan);
    tb(s, [br(label('2.  Job Location:')), body('Toronto, Mississauga, ON', { fontSize:17, bold:true })], 1.75, 3.85, 4.8, 0.9);
    iconCircle(s, 0.95, 4.95, 0.6, 'FaLink', C.cyan);
    tb(s, [br(label('3.  Job Posting Link:')), { text:'https://www.workopolis.com/search?q=penetration+testing&l=toronto%2C+on', options:{ fontFace:M, fontSize:11, color:C.cyan, hyperlink:{ url:'https://www.workopolis.com/search?q=penetration+testing&l=toronto%2C+on' } } }], 1.75, 4.95, 4.8, 1.3);
    // right: duties
    card(s, 7.0, 1.8, 5.75, 4.9, { fill:C.card2 });
    iconCircle(s, 7.35, 2.15, 0.9, 'FaCrosshairs', C.cyan);
    tb(s, [label('4.  Brief description of primary duties (1 or 2 sentences):', { fontSize:10 })], 8.45, 2.25, 4.1, 0.8);
    s.addText('“', { x:7.3, y:3.2, w:1, h:1, fontFace:'Cambria', fontSize:96, color:C.green, isTextBox:true, margin:0, transparency:40 });
    s.addText('Identifying vulnerabilities and security issues that put CGI at risk of a data breach.', { x:7.45, y:3.95, w:4.9, h:2.2, fontFace:B, fontSize:21, color:C.text, isTextBox:true, margin:0, valign:'top', lineSpacingMultiple:1.15 });
    s.addNotes(`Reference: Workopolis job posting — https://www.workopolis.com/search?q=penetration+testing&l=toronto%2C+on`);
    pageNum(s, 3);
  }

  // =====================================================================
  // 4. REQUIREMENTS (1-4)
  // =====================================================================
  {
    const s = base();
    header(s, '// 04  JOB POSTING · REQUIREMENTS', 'Job Posting');
    const cw = 5.95, ch = 2.5, x0 = 0.6, y0 = 1.7, gx = 0.3, gy = 0.22;
    const cells = [
      { i:'FaGraduationCap', t:'1. Degree/Diploma Required:', runs:[
        br(body('A Bachelor’s degree in Computer Science, Cybersecurity, or IT. Equivalent tech diplomas combined with recognized cybersecurity bootcamps and certifications are also accepted.', { fontSize:12.5 })),
        src('Source: Cyber Degrees', link('CAESbQHr')) ] },
      { i:'FaTerminal', t:'2. Programming Languages Required/Recommended:', runs:[
        br(body('Python (for automation)', { fontSize:12, bullet:true })),
        br(body('Bash & PowerShell (for system scripting)', { fontSize:12, bullet:true })),
        br(body('Java & Go (for web application testing)', { fontSize:12, bullet:true })),
        src('Source: Reddit Computer Science Careers', link('CAESogEB')) ] },
      { i:'FaTools', t:'3. Required Skills:', runs:[
        br(body('Vulnerability Assessment (using tools like Nmap, Burp Suite, and Metasploit)', { fontSize:12, bullet:true })),
        br(body('Operating Systems Infrastructure (advanced Linux and Windows breach mechanics)', { fontSize:12, bullet:true })),
        br(body('Technical Report Writing (documenting exploit findings for stakeholders)', { fontSize:12, bullet:true })),
        src('Source: Cyber Degrees Hard Skills Guide', link('CAESbQHr'), { hyperlink: undefined }) ] },
      { i:'FaHourglassHalf', t:'4. Experience Required:', runs:[
        br(body('Typically 0 to 2 years for junior positions if heavily certified, or 3 to 5 years in a foundational IT/security role like network administration or SOC analysis.', { fontSize:12.5 })),
        { text:'Source: Reddit Computer Science Careers', options:{ fontFace:M, fontSize:9.5, color:C.green } } ] },
    ];
    cells.forEach((c, k) => {
      const x = x0 + (k%2)*(cw+gx), y = y0 + Math.floor(k/2)*(ch+gy);
      card(s, x, y, cw, ch);
      iconCircle(s, x+0.22, y+0.22, 0.55, c.i);
      s.addText(c.t, { x:x+0.9, y:y+0.22, w:cw-1.1, h:0.55, fontFace:M, fontSize:10.5, color:C.cyan, charSpacing:1, isTextBox:true, margin:0, valign:'middle' });
      tb(s, c.runs, x+0.22, y+0.88, cw-0.44, ch-1.0, { paraSpaceAfter:3 });
    });
    s.addNotes(`References:
- Cyber Degrees — ${link('CAESbQHr')}
- Reddit Computer Science Careers — ${link('CAESogEB')}
- Cyber Degrees Hard Skills Guide`);
    pageNum(s, 4);
  }

  // =====================================================================
  // 5. SALARY (5-7)
  // =====================================================================
  {
    const s = base();
    header(s, '// 05  JOB POSTING · SALARY', 'Job Posting');
    const rows = [
      { n:'5. Salary for this job:', big:'$95,000 – $130,000', t:'The average annual salary ranges between $95,000 and $130,000 USD (approximately $130,000 CAD in major markets like Toronto).', s:['Source: Morgan McKinley Salary Guide', link('CAEShgEB')], lo:95, hi:130, color:C.green },
      { n:'6. Salary range for entry level:', big:'$75,000 – $95,000', t:'Between $75,000 and $95,000 USD per year for a Junior Penetration Tester.', s:['Source: HackerDNA Salary Breakdown', link('CAESbAHr')], lo:75, hi:95, color:C.cyan },
      { n:'7. Salary for experienced level:', big:'$150,000 – $200,000+', t:'Between $150,000 and $200,000+ USD per year for a Lead or Principal Penetration Tester.', s:['Source: HackerDNA Salary Breakdown', null], lo:150, hi:200, color:C.amber },
    ];
    const y0 = 1.7, rh = 1.62, gap = 0.1;
    rows.forEach((r, k) => {
      const y = y0 + k*(rh+gap);
      card(s, 0.6, y, 7.4, rh);
      iconCircle(s, 0.82, y+0.25, 0.55, k===0?'FaDollarSign':k===1?'FaChartLine':'FaTrophy', r.color);
      s.addText(r.n, { x:1.55, y:y+0.22, w:5.5, h:0.3, fontFace:M, fontSize:10.5, color:C.cyan, charSpacing:1, isTextBox:true, margin:0 });
      s.addText(r.big, { x:1.55, y:y+0.5, w:6.2, h:0.5, fontFace:H, fontSize:24, bold:true, color:r.color, isTextBox:true, margin:0, valign:'middle' });
      tb(s, [br(body(r.t, { fontSize:11.5 })), r.s[1] ? src(r.s[0], r.s[1]) : { text:r.s[0], options:{ fontFace:M, fontSize:9.5, color:C.green } }], 1.55, y+1.0, 6.2, 0.55, { paraSpaceAfter:1 });
    });
    // right: range visual
    card(s, 8.3, 1.7, 4.45, 5.1, { fill:C.card2 });
    s.addText('USD PER YEAR', { x:8.6, y:2.0, w:4, h:0.3, fontFace:M, fontSize:10, color:C.dim, charSpacing:3, isTextBox:true, margin:0 });
    const tx = 8.6, tw = 3.85, max = 220;
    const tracks = [[rows[1],'Junior Penetration Tester'],[rows[0],'average annual salary'],[rows[2],'Lead or Principal Penetration Tester']];
    tracks.forEach(([r, cap], k) => {
      const y = 2.55 + k*1.35;
      s.addText(cap, { x:tx, y, w:tw, h:0.3, fontFace:B, fontSize:11, color:C.muted, isTextBox:true, margin:0, italic:true });
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:tx, y:y+0.38, w:tw, h:0.34, rectRadius:0.17, fill:{ color:C.line }, line:{ color:C.line, width:0 } });
      const bx = tx + tw*(r.lo/max), bw = tw*((r.hi-r.lo)/max);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:bx, y:y+0.38, w:bw, h:0.34, rectRadius:0.17, fill:{ color:r.color }, line:{ color:r.color, width:0 }, shadow:{ type:'outer', color:r.color, blur:10, offset:0, angle:90, opacity:0.5 } });
      s.addText(r.big.replace(/,000/g,'K').replace(/\$/g,'$'), { x:tx, y:y+0.78, w:tw, h:0.3, fontFace:M, fontSize:10.5, color:r.color, isTextBox:true, margin:0 });
    });
    s.addText('$0', { x:tx, y:6.45, w:1, h:0.25, fontFace:M, fontSize:9, color:C.dim, isTextBox:true, margin:0 });
    s.addText('$220K', { x:tx+tw-1, y:6.45, w:1, h:0.25, align:'right', fontFace:M, fontSize:9, color:C.dim, isTextBox:true, margin:0 });
    s.addNotes(`References:
- Morgan McKinley Salary Guide — ${link('CAEShgEB')}
- HackerDNA Salary Breakdown — ${link('CAESbAHr')}`);
    pageNum(s, 5);
  }

  // =====================================================================
  // 6. JOB OUTLOOK
  // =====================================================================
  {
    const s = base();
    header(s, '// 06  DEMAND', 'Job Outlook');
    // big stat
    card(s, 0.6, 1.8, 5.2, 4.9, { fill:'0F2A26', line:C.green, lw:1.25, glow:true });
    iconCircle(s, 0.95, 2.15, 0.7, 'FaGlobeAmericas');
    s.addText('GLOBAL SHORTAGE', { x:1.85, y:2.3, w:3.5, h:0.4, fontFace:M, fontSize:11, color:C.green, charSpacing:3, isTextBox:true, margin:0, valign:'middle' });
    s.addText('4.8', { x:0.95, y:3.05, w:4.6, h:1.6, fontFace:H, fontSize:110, bold:true, color:C.white, isTextBox:true, margin:0, valign:'middle' });
    s.addText('million jobs', { x:0.95, y:4.65, w:4.6, h:0.6, fontFace:H, fontSize:28, bold:true, color:C.green, isTextBox:true, margin:0, valign:'middle' });
    s.addText([{ text:'According to ', options:{ fontFace:B, fontSize:12, color:C.muted } }, { text:'Linkedin', options:{ fontFace:B, fontSize:12, color:C.cyan, hyperlink:{ url: link('CAESnQEB') } } }], { x:0.95, y:5.45, w:4.6, h:0.4, isTextBox:true, margin:0, valign:'top' });
    // Q/A cards
    const qa = [
      ['1.  Is it currently in high demand?', [ { text:'According to ', options:{ fontFace:B, fontSize:15, color:C.text } }, { text:'Linkedin', options:{ fontFace:B, fontSize:15, color:C.cyan, hyperlink:{ url: link('CAESnQEB') } } }, { text:' penetration testing has a global shortage of 4.8 million jobs.', options:{ fontFace:B, fontSize:15, color:C.text } } ]],
      ['2.  Will there be a high demand in the future when you graduate university?', [ body('Yes 4.8 million jobs will not be filled in one 3 years.', { fontSize:15 }) ]],
    ];
    qa.forEach(([q, a], k) => {
      const y = 1.8 + k*2.55;
      card(s, 6.1, y, 6.65, 2.35);
      s.addText(q, { x:6.4, y:y+0.25, w:6.1, h:0.55, fontFace:M, fontSize:11, color:C.cyan, charSpacing:1, isTextBox:true, margin:0, valign:'top' });
      s.addShape(pres.shapes.LINE, { x:6.4, y:y+0.9, w:0.5, h:0, line:{ color:C.green, width:2 } });
      s.addText(a, { x:6.4, y:y+1.0, w:6.1, h:1.2, isTextBox:true, margin:0, valign:'top', lineSpacingMultiple:1.1 });
    });
    s.addNotes(`Reference: Linkedin — ${link('CAESnQEB')}`);
    pageNum(s, 6);
  }

  // =====================================================================
  // 7. WHAT DO YOU THINK (job)
  // =====================================================================
  function opinion(n, kicker, q1, a1, q2, a2, iconGood, iconBad) {
    const s = base();
    header(s, kicker, 'What do you think?');
    const cw = 5.9, ch = 4.6, y = 1.95;
    [[0.6, q1, a1, iconGood, C.green, '0F2A26'], [6.85, q2, a2, iconBad, C.rose, '2A1420']].forEach(([x, q, a, i, col, fill]) => {
      card(s, x, y, cw, ch, { fill, line: col, lw:1 });
      s.addShape(pres.shapes.OVAL, { x:x+0.35, y:y+0.35, w:0.95, h:0.95, fill:{ color:col, transparency:80 }, line:{ color:col, width:1, transparency:30 } });
      s.addImage({ data: ic[i], x:x+0.6, y:y+0.6, w:0.45, h:0.45 });
      s.addText(q, { x:x+0.35, y:y+1.55, w:cw-0.7, h:0.75, fontFace:M, fontSize:11, color:col, charSpacing:1, isTextBox:true, margin:0, valign:'top' });
      s.addText(a, { x:x+0.35, y:y+2.35, w:cw-0.7, h:2.0, fontFace:B, fontSize:19, color:C.text, isTextBox:true, margin:0, valign:'top', lineSpacingMultiple:1.15 });
    });
    pageNum(s, n);
  }
  opinion(7, '// 07  MY TAKE ON THE JOB',
    'What interests you most about the job? (1 or 2 sentences)', 'The job requires mathematical and visual problem solving skills thinks which are things i enjoy.',
    'What do you dislike about the job? (1 or 2 sentences)', 'It requires a lot of learning how to code wich is long and can be quite tiring.', 'FaHeart', 'FaThumbsDown');

  // =====================================================================
  // 8. UNIVERSITY
  // =====================================================================
  {
    const s = base();
    header(s, '// 08  POST-SECONDARY', 'University/College Research');
    card(s, 0.6, 1.8, 7.3, 4.9);
    iconCircle(s, 0.95, 2.15, 0.8, 'FaUniversity', C.cyan);
    tb(s, [label('1.  Name of University/College:')], 1.95, 2.2, 5.6, 0.3);
    s.addText([{ text:'Ontario Tech University', options:{ fontFace:H, fontSize:24, bold:true, color:C.white, hyperlink:{ url: link('CAESUAHr') } } }], { x:1.95, y:2.48, w:5.6, h:0.5, isTextBox:true, margin:0, valign:'top' });
    const fields = [['2.  Location:', 'Oshawa, Ontario, Canada', 'FaMapMarkerAlt'], ['3.  Degree/Diploma Name:', 'Bachelor of Information Technology (Honours) in Networking and Information Technology Security', 'FaGraduationCap'], ['4.  Number of Years:', '4 years', 'FaHourglassHalf']];
    let y = 3.3;
    fields.forEach(([l, v, i], k) => {
      const h = k===1 ? 1.15 : 0.75;
      s.addShape(pres.shapes.OVAL, { x:0.95, y:y+0.02, w:0.5, h:0.5, fill:{ color:C.cyan, transparency:82 }, line:{ color:C.cyan, width:0 } });
      s.addImage({ data: ic[i], x:1.09, y:y+0.16, w:0.22, h:0.22 });
      tb(s, [br(label(l)), body(v, { fontSize: k===1 ? 14 : 16, bold:true })], 1.65, y, 5.9, h);
      y += h + 0.15;
    });
    // tuition
    s.addText('5.  Tuition Cost per year:', { x:8.2, y:1.8, w:4.5, h:0.35, fontFace:M, fontSize:11, color:C.cyan, charSpacing:1, isTextBox:true, margin:0 });
    const tu = [['Local (Domestic) Rate:', '$9,031', 'Approximately $9,031 CAD per year', 'Source:OntarioTechDomesticTuition', 'https://ontariotechu.ca', C.green],
                ['International Rate:', '$43,888', 'Approximately $43,888 CAD per year', 'Source:OntarioTechInternationalTuition', 'https://ontariotechu.ca', C.cyan]];
    tu.forEach(([l, big, t, st, su, col], k) => {
      const y = 2.25 + k*2.3;
      card(s, 8.2, y, 4.55, 2.15, { fill:C.card2 });
      s.addText(l, { x:8.5, y:y+0.2, w:4, h:0.3, fontFace:B, fontSize:12, bold:true, color:C.muted, isTextBox:true, margin:0 });
      s.addText(big, { x:8.5, y:y+0.5, w:4, h:0.8, fontFace:H, fontSize:40, bold:true, color:col, isTextBox:true, margin:0, valign:'middle' });
      tb(s, [br(body(t, { fontSize:12 })), src(st, su)], 8.5, y+1.35, 4.0, 0.7, { paraSpaceAfter:2 });
    });
    s.addNotes(`References:
- Ontario Tech University — ${link('CAESUAHr')}
- Ontario Tech Domestic Tuition / International Tuition — https://ontariotechu.ca`);
    pageNum(s, 8);
  }

  // =====================================================================
  // 9. DORM/FOOD + ADMISSION
  // =====================================================================
  {
    const s = base();
    header(s, '// 09  COST OF DORM/FOOD · ADMISSION REQUIREMENTS', 'University/College Research');
    const cal = 'https://calendar.ontariotechu.ca/preview_%7Bp%7Drogram.php?catoid=67&poid=14513';
    // left column: dorm & food
    s.addText('6.  Cost of Dorm/Food:', { x:0.6, y:1.75, w:5, h:0.3, fontFace:M, fontSize:11, color:C.cyan, charSpacing:1, isTextBox:true, margin:0 });
    const cf = [['FaBed', 'Dorm Room (Residence Rates):', 'Room costs range between $8,950 and $9,350 CAD per academic year, depending on the chosen campus building (e.g., South Village or Simcoe Village).', 'Source:OntarioTechResidenceRates', 'https://ontariotechuresidence.ca/residence-rates/'],
                ['FaUtensils', 'Food (Meal Plan):', 'A mandatory 7-day unlimited meal plan for South Village residents costs $7,949 CAD per academic year.', 'Source:OntarioTechMealPlans', 'https://ontariotechuresidence.ca/meal-plans/']];
    cf.forEach(([i, l, t, st, su], k) => {
      const y = 2.15 + k*2.35;
      card(s, 0.6, y, 4.9, 2.2);
      iconCircle(s, 0.82, y+0.22, 0.55, i, C.cyan);
      s.addText(l, { x:1.5, y:y+0.22, w:3.8, h:0.55, fontFace:B, fontSize:13, bold:true, color:C.white, isTextBox:true, margin:0, valign:'middle' });
      tb(s, [br(body(t, { fontSize:12.5 })), src(st, su)], 0.82, y+0.9, 4.45, 1.25, { paraSpaceAfter:3 });
    });
    // right column: admissions
    s.addText('7.  Admission Requirements:', { x:5.8, y:1.75, w:6, h:0.3, fontFace:M, fontSize:11, color:C.cyan, charSpacing:1, isTextBox:true, margin:0 });
    card(s, 5.8, 2.15, 6.95, 4.55, { fill:C.card2 });
    iconCircle(s, 6.05, 2.4, 0.55, 'FaClipboardCheck', C.cyan);
    const sc = (extra={}) => src('(Source:OntarioTechAcademicCalendar)', cal, extra);
    tb(s, [
      body('You must earn your Ontario Secondary School Diploma (OSSD) with at least six Grade 12 U or M level courses ', { fontSize:12 }), sc(), br(body(' These credits must include:', { fontSize:12 })),
      body('English (ENG4U) (Minimum recommended average of 60%) ', { fontSize:12, bullet:true }), br(sc()),
      body('One Grade 12 Math course: Either Advanced Functions (MHF4U), Calculus and Vectors (MCV4U), or Mathematics of Data Management (MDM4U) (Minimum recommended average of 60%) ', { fontSize:12, bullet:true }), br(sc()),
      body('Alternatively: ', { fontSize:12, bullet:true, bold:true }), body('Computer Science (ICS4U) can be accepted with a recommended minimum average of 70%. ', { fontSize:12 }), sc(),
    ], 6.8, 2.4, 5.7, 4.1, { paraSpaceAfter:8 });
    s.addNotes(`References:
- Ontario Tech Residence Rates — https://ontariotechuresidence.ca/residence-rates/
- Ontario Tech Meal Plans — https://ontariotechuresidence.ca/meal-plans/
- Ontario Tech Academic Calendar — https://calendar.ontariotechu.ca/preview_{p}rogram.php?catoid=67&poid=14513`);
    pageNum(s, 9);
  }

  // =====================================================================
  // 10. COMPETITIVENESS + WEBPAGE
  // =====================================================================
  {
    const s = base();
    header(s, '// 10  HOW COMPETITIVE IS IT?', 'University/College Research');
    const cal = 'https://calendar.ontariotechu.ca/preview_%7Bp%7Drogram.php?catoid=67&poid=14513';
    const uni = 'https://uniscope.ca/ontario-tech-university';
    s.addText('8.  How competitive is it?', { x:0.6, y:1.75, w:6, h:0.3, fontFace:M, fontSize:11, color:C.cyan, charSpacing:1, isTextBox:true, margin:0 });
    card(s, 0.6, 2.15, 7.9, 4.55);
    iconCircle(s, 0.85, 2.4, 0.55, 'FaTrophy', C.cyan);
    tb(s, [
      body('Competition & Marks: ', { fontSize:13, bold:true, color:C.white }), body('Admission is competitive, and meeting minimum cutoffs does not guarantee a spot ', { fontSize:13 }), src('(Source:OntarioTechAcademicCalendar)', cal), body('. While the overall university acceptance rate hovers around 70%, specialized IT security streams usually expect competitive grade averages ranging from the mid-70s to low-80s across your top six Grade 12 courses ', { fontSize:13 }), src('(Source:UniscopeOntarioTechOverview)', uni), br(body('.', { fontSize:13 })),
      body('Other helpful entry factors: ', { fontSize:13, bold:true, color:C.white }), body('The university closely evaluates the specific distribution of subjects you take and your scores in relevant STEM fields ', { fontSize:13 }), src('(Source:OntarioTechAcademicCalendar)', cal), body('. Excelling in independent programming projects, participating in tech high school clubs, or possessing a Specialist High Skills Major (SHSM) in digital media/ICT will strengthen your baseline readiness for the program context.', { fontSize:13 }),
    ], 1.6, 2.4, 6.6, 4.1, { paraSpaceAfter:12, lineSpacingMultiple:1.15 });
    // right: stat + webpage
    card(s, 8.8, 2.15, 3.95, 2.05, { fill:'0F2A26', line:C.green, lw:1.25, glow:true });
    s.addText('~70%', { x:9.05, y:2.3, w:3.5, h:0.95, fontFace:H, fontSize:48, bold:true, color:C.green, isTextBox:true, margin:0, valign:'middle' });
    s.addText('overall university acceptance rate hovers around 70%', { x:9.05, y:3.25, w:3.5, h:0.8, fontFace:B, fontSize:11.5, color:C.muted, italic:true, isTextBox:true, margin:0, valign:'top' });
    s.addText('9.  Webpage link you got most of the university information:', { x:8.8, y:4.4, w:3.95, h:0.5, fontFace:M, fontSize:10, color:C.cyan, charSpacing:1, isTextBox:true, margin:0, valign:'top' });
    card(s, 8.8, 4.95, 3.95, 1.75, { fill:C.card2 });
    // (link row widened to keep the closing period on the same line)
    s.addImage({ data: ic.FaExternalLinkAlt, x:9.05, y:5.15, w:0.3, h:0.3 });
    s.addText([{ text:'Most academic, program-specific structures and strict course criteria are directly cited from the ', options:{ fontFace:B, fontSize:10.5, color:C.text } }, { text:'Ontario Tech University Program Calendar Guide', options:{ fontFace:B, fontSize:9.5, color:C.cyan, bold:true, hyperlink:{ url: link('CAESgQEB') } } }, { text:'.', options:{ fontFace:B, fontSize:10.5, color:C.text } }], { x:9.38, y:5.1, w:3.3, h:1.5, isTextBox:true, margin:0, valign:'top' });
    s.addNotes(`References:
- Ontario Tech Academic Calendar — https://calendar.ontariotechu.ca/preview_{p}rogram.php?catoid=67&poid=14513
- Uniscope Ontario Tech Overview — https://uniscope.ca/ontario-tech-university
- Ontario Tech University Program Calendar Guide — ${link('CAESgQEB')}`);
    pageNum(s, 10);
  }

  // =====================================================================
  // 11. WHAT DO YOU THINK (university)
  // =====================================================================
  opinion(11, '// 11  MY TAKE ON THE UNIVERSITY',
    'What interests you most about the university? (1 or 2 sentences)', 'It has a nice campus and highly experienced teachers',
    'What do you dislike about the university? (1 or 2 sentences)', 'Its non seventh day adventist and it\'s quite big', 'FaUniversity', 'FaThumbsDown');

  // =====================================================================
  // 12. EMERGING TECHNOLOGY
  // =====================================================================
  {
    const s = base('title');
    header(s, '// 12  ARTIFICIAL INTELLIGENCE', 'Emerging Technology');
    const cw = 3.95, ch = 4.95, y = 1.75, gx = 0.25, x0 = 0.6;
    // col 1: article + summary
    card(s, x0, y, cw, ch);
    iconCircle(s, x0+0.25, y+0.25, 0.55, 'FaNewspaper');
    s.addText('Find an article related to AI.', { x:x0+0.95, y:y+0.25, w:cw-1.15, h:0.55, fontFace:M, fontSize:10, color:C.cyan, charSpacing:1, isTextBox:true, margin:0, valign:'middle' });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:x0+0.25, y:y+0.95, w:cw-0.5, h:0.5, rectRadius:0.25, fill:{ color:C.green, transparency:85 }, line:{ color:C.green, width:0.75, transparency:30 } });
    s.addText([{ text:'"AI Is at a Turning Point"', options:{ fontFace:B, fontSize:12.5, bold:true, italic:true, color:C.green, hyperlink:{ url: link('CAESdQHr') } } }], { x:x0+0.4, y:y+0.95, w:cw-0.8, h:0.5, isTextBox:true, margin:0, valign:'middle', align:'center' });
    tb(s, [br(label('Give a brief summary of the article.', { fontSize:10 })), body('Ai went from basic sentences articulation to advanced multi step processes. This has lead to findings that shock researchers when testing models that show resistance to deletion. Bengio even shares that some ai is fabricating online identities and social engineering.', { fontSize:12 })], x0+0.25, y+1.65, cw-0.5, 3.2, { paraSpaceAfter:6, lineSpacingMultiple:1.1 });
    // col 2: thoughts
    const x1 = x0 + cw + gx;
    card(s, x1, y, cw, ch, { fill:'0F2A26', line:C.green, lw:1, glow:true });
    iconCircle(s, x1+0.25, y+0.25, 0.55, 'FaComment');
    s.addText('What are your thought on it?', { x:x1+0.95, y:y+0.25, w:cw-1.15, h:0.55, fontFace:M, fontSize:10, color:C.cyan, charSpacing:1, isTextBox:true, margin:0, valign:'middle' });
    s.addText('“', { x:x1+0.2, y:y+0.85, w:0.8, h:0.9, fontFace:'Cambria', fontSize:72, color:C.green, isTextBox:true, margin:0, transparency:40 });
    s.addText('Ai is one of the most advanced and useful tools humanity will ever create but if not use with proper safeguards we may engineer destruction instead of prosperity.', { x:x1+0.3, y:y+1.55, w:cw-0.6, h:3.2, fontFace:B, fontSize:15, color:C.text, isTextBox:true, margin:0, valign:'top', lineSpacingMultiple:1.2 });
    // col 3: job industry
    const x2 = x1 + cw + gx;
    card(s, x2, y, cw, ch, { fill:C.card2 });
    iconCircle(s, x2+0.25, y+0.25, 0.55, 'FaBrain');
    s.addText('How is AI affecting the Job industry you have chosen?', { x:x2+0.95, y:y+0.25, w:cw-1.15, h:0.55, fontFace:M, fontSize:10, color:C.cyan, charSpacing:1, isTextBox:true, margin:0, valign:'middle' });
    s.addText('Neurosurgery is and advanced field that vary rarely proceeds without brain scans, Ai can now read CT and mri scans of the brain and predict a diagnosis better than any human ever will allowing surgeons to spend more time actually fixing the problem rather than thinking about it.', { x:x2+0.25, y:y+0.95, w:cw-0.5, h:3.8, fontFace:B, fontSize:12.5, color:C.text, isTextBox:true, margin:0, valign:'top', lineSpacingMultiple:1.15 });
    s.addNotes(`Reference: "AI Is at a Turning Point" — ${link('CAESdQHr')}`);
    pageNum(s, 12);
  }

  await pres.writeFile({ fileName: 'Career-Research.pptx' });
  console.log('written');
})().catch(e => { console.error(e); process.exit(1); });
