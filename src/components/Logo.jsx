// IL LOGO: una fetta di lime che sembra un grafico a torta (decisione
// dell'utente del 09/11/2026, insieme al nome «Lime – SmartOrders»). Buccia
// verde, polpa chiara divisa in otto spicchi da righe bianche, uno spicchio
// più scuro e un filo staccato dagli altri: è lui a far leggere la fetta
// come un grafico. Un SVG in linea, che prende la misura dal testo
// accanto; decorativo, il nome lo dice il testo del marchio (aria-hidden).
// Lo stesso disegno sta in public/favicon.svg.
export default function Logo({ dimensione = '1.25em', className = '' }) {
  return (
    <svg className={`marchio-logo ${className}`.trim()} width={dimensione} height={dimensione} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {/* La buccia e la polpa. */}
      <circle cx="16" cy="16" r="15" fill="#5aa21f" />
      <circle cx="16" cy="16" r="12.6" fill="#dff0a5" />
      {/* Gli spicchi: otto raggi bianchi. */}
      <g stroke="#fbfdf2" strokeWidth="1.3" strokeLinecap="round">
        <line x1="16" y1="16" x2="16" y2="3.6" />
        <line x1="16" y1="16" x2="24.77" y2="7.23" />
        <line x1="16" y1="16" x2="28.4" y2="16" />
        <line x1="16" y1="16" x2="24.77" y2="24.77" />
        <line x1="16" y1="16" x2="16" y2="28.4" />
        <line x1="16" y1="16" x2="7.23" y2="24.77" />
        <line x1="16" y1="16" x2="3.6" y2="16" />
        <line x1="16" y1="16" x2="7.23" y2="7.23" />
      </g>
      {/* Lo spicchio in evidenza, staccato di un filo: la fetta di torta. */}
      <path d="M17.2 14.8 L17.2 2.2 A13.8 13.8 0 0 1 29.8 14.8 Z" fill="#8cc63f" stroke="#fbfdf2" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
