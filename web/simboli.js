/* Airsoft Conflict — palette di simboli da mettere sulla cartina (segnalazioni fisse: obiettivi, tattici, pericoli, terreno).
   Ogni simbolo è disegnato in SVG in un quadrato -12..12, bianco su disco scuro con anello del colore della categoria.
   campo.segni = [{ id, sym, x, y, lat, lon, nome, dim: 1|1.4|1.8, usi:{conflict,allenamento,pcs,dmz} }] */
(function () {
  'use strict';
  var S = 'fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  var F = 'fill="#fff" stroke="none"';
  function t(s, sz) { return '<text x="0" y="0.5" font-size="' + (sz || 11) + '" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="Barlow Condensed, Arial, sans-serif">' + s + '</text>'; }
  var CATEGORIE = [
    { id: 'obiettivi', nome: 'Obiettivi', colore: '#e8c96a', simboli: [
      ['taglia', 'Taglia / bersaglio', '<circle cx="0" cy="0" r="7" ' + S + '/><path d="M0 -11V-4M0 4V11M-11 0H-4M4 0H11" ' + S + '/><circle cx="0" cy="0" r="1.6" ' + F + '/>'],
      ['sabotaggio', 'Sabotaggio / esplosivo', '<rect x="-8" y="-3" width="16" height="10" rx="1.5" ' + S + '/><path d="M-3 -3V7M3 -3V7" ' + S + '/><path d="M5 -3C6 -7 9 -7 10 -10" ' + S + '/><path d="M10 -10l1.6-1.6M10 -10l2 .4M10 -10l-.4-2" stroke="#ffcf5a" stroke-width="1.6" stroke-linecap="round"/>'],
      ['intel', 'Intel / documenti', '<path d="M-6 -9H3L7 -5V9H-6Z" ' + S + '/><path d="M3 -9V-5H7M-3 -2H4M-3 2H4M-3 6H2" ' + S + '/>'],
      ['cassa', 'Cassa / rifornimenti', '<rect x="-8" y="-7" width="16" height="14" rx="1" ' + S + '/><path d="M-8 -7L8 7M8 -7L-8 7" ' + S + '/>'],
      ['vip', 'VIP / ostaggio', '<circle cx="0" cy="-4.5" r="3.5" ' + S + '/><path d="M-7 9C-7 3 -4 1 0 1S7 3 7 9" ' + S + '/>'],
      ['estrazione', 'Estrazione', t('H', 15)],
      ['obiettivo', 'Obiettivo', '<path d="M-6 10V-10M-6 -9H8L4 -5L8 -1H-6" ' + S + '/>'],
      ['hack', 'Terminale / hack', '<rect x="-9" y="-8" width="18" height="12" rx="1.5" ' + S + '/><path d="M-4 9H4M0 4V9M-5 -4L-2 -2L-5 0M0 0H4" ' + S + '/>']
    ] },
    { id: 'tattici', nome: 'Tattici', colore: '#5fd3c6', simboli: [
      ['respawn', 'Respawn', '<path d="M7 -3A7.5 7.5 0 1 0 6 5" ' + S + '/><path d="M7.5 -9V-3H1.5" ' + S + '/>'],
      ['medico', 'Medico', '<path d="M-2.5 -9H2.5V-2.5H9V2.5H2.5V9H-2.5V2.5H-9V-2.5H-2.5Z" ' + F + '/>'],
      ['munizioni', 'Munizioni', '<path d="M-6 9V-2C-6 -6 -4 -8 -4 -8S-2 -6 -2 -2V9ZM2 9V-2C2 -6 4 -8 4 -8S6 -6 6 -2V9Z" ' + S + '/><path d="M-6 5H-2M2 5H6" ' + S + '/>'],
      ['osservazione', 'Osservazione', '<path d="M-10 0C-6 -6 6 -6 10 0C6 6 -6 6 -10 0Z" ' + S + '/><circle cx="0" cy="0" r="3" ' + F + '/>'],
      ['rv', 'Punto di raccolta', '<path d="M0 -9L9.5 8H-9.5Z" ' + S + '/>' + '<text x="0" y="3.5" font-size="7" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="Barlow Condensed, Arial, sans-serif">RV</text>'],
      ['blocco', 'Posto di blocco', '<rect x="-10" y="-4" width="20" height="6" rx="1" ' + S + '/><path d="M-6 -4L-2 2M0 -4L4 2M6 -4L9 0M-8 2V9M8 2V9" ' + S + '/>'],
      ['postazione', 'Postazione fortificata', '<path d="M-10 6C-10 -2 -5 -6 0 -6S10 -2 10 6Z" ' + S + '/><path d="M-6 0H6M-4 -4H4" ' + S + '/>'],
      ['radio', 'Radio / antenna', '<path d="M0 9V-4M-4 9H4" ' + S + '/><circle cx="0" cy="-5" r="1.6" ' + F + '/><path d="M-4.5 -9.5A6.5 6.5 0 0 0 -4.5 -0.5M4.5 -9.5A6.5 6.5 0 0 1 4.5 -0.5" ' + S + '/>'],
      ['mortaio', 'Mortaio', '<path d="M-2 4L5 -9M2 6L9 -7" ' + S + '/><path d="M-9 9L1 5M-3 9L0 5" ' + S + '/>'],
      ['veicolo', 'Veicolo', '<path d="M-10 4V-1L-7 -6H5L9 -1H10V4Z" ' + S + '/><circle cx="-5" cy="6" r="2.3" ' + S + '/><circle cx="5" cy="6" r="2.3" ' + S + '/>']
    ] },
    { id: 'pericoli', nome: 'Pericoli', colore: '#ff6b5e', simboli: [
      ['pericolo', 'Pericolo', '<path d="M0 -10L10 8H-10Z" ' + S + '/><path d="M0 -3V2" ' + S + '/><circle cx="0" cy="5" r="1.2" ' + F + '/>'],
      ['mine', 'Zona minata', '<circle cx="0" cy="1" r="5.5" ' + S + '/><path d="M0 -4.5V-9M-4 -3L-7 -6M4 -3L7 -6M-10 7H10" ' + S + '/>'],
      ['gas', 'Gas / contaminazione', '<circle cx="0" cy="0" r="2" ' + F + '/><circle cx="0" cy="-6" r="3.6" ' + S + '/><circle cx="-5.2" cy="3" r="3.6" ' + S + '/><circle cx="5.2" cy="3" r="3.6" ' + S + '/>'],
      ['filo', 'Filo spinato', '<path d="M-11 0H11" ' + S + '/><path d="M-8 -3L-5 3M-5 -3L-8 3M-1.5 -3L1.5 3M1.5 -3L-1.5 3M5 -3L8 3M8 -3L5 3" ' + S + '/>'],
      ['vietato', 'Zona vietata', '<circle cx="0" cy="0" r="9" ' + S + '/><path d="M-6.4 6.4L6.4 -6.4" ' + S + '/>'],
      ['cecchino', 'Cecchino', '<circle cx="0" cy="0" r="8.5" ' + S + '/><path d="M0 -8.5V-3M0 3V8.5M-8.5 0H-3M3 0H8.5" ' + S + '/><path d="M-4 -4L4 4" stroke="#ff6b5e" stroke-width="1.6"/>'],
      ['acqua', 'Acqua profonda', '<path d="M-10 -3C-7 -6 -3 0 0 -3S7 0 10 -3M-10 3C-7 0 -3 6 0 3S7 6 10 3" ' + S + '/>'],
      ['fuori', 'Fuori campo', t('OUT', 9)]
    ] },
    { id: 'terreno', nome: 'Terreno e servizi', colore: '#cfcab8', simboli: [
      ['edificio', 'Edificio', '<path d="M-9 0L0 -9L9 0M-7 -2V9H7V-2" ' + S + '/><path d="M-2 9V3H2V9" ' + S + '/>'],
      ['bunker', 'Bunker', '<path d="M-10 8V2C-10 -5 -5 -8 0 -8S10 -5 10 2V8Z" ' + S + '/><path d="M-5 -1H5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>'],
      ['ponte', 'Ponte', '<path d="M-11 -2H11M-11 3H11M-7 3C-7 8 -2 8 -2 8M7 3C7 8 2 8 2 8" ' + S + '/>'],
      ['ingresso', 'Ingresso / cancello', '<path d="M-9 9V-8M9 9V-8M-9 -4H9M-9 2H9M-4 -4V2M2 -4V2" ' + S + '/>'],
      ['parcheggio', 'Parcheggio', t('P', 15)],
      ['sicura', 'Zona sicura', '<path d="M0 -10L8 -6V0C8 5 4 8 0 10C-4 8 -8 5 -8 0V-6Z" ' + S + '/><path d="M-3.5 0L-1 3L4 -3" ' + S + '/>'],
      ['wc', 'Servizi / WC', t('WC', 11)],
      ['riferimento', 'Punto di riferimento', '<path d="M0 -10L6 2H-6Z" ' + S + '/><path d="M0 -4L7 8H-7Z" ' + S + '/><path d="M0 8V11" ' + S + '/>'],
      ['fonte', 'Acqua potabile', '<path d="M0 -10C-4 -4 -7 0 -7 3A7 7 0 0 0 7 3C7 0 4 -4 0 -10Z" ' + S + '/>']
    ] }
  ];
  var PER_ID = {};
  CATEGORIE.forEach(function (c) { c.simboli.forEach(function (s) { PER_ID[s[0]] = { id: s[0], nome: s[1], disegno: s[2], cat: c }; }); });
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // il simbolo come gruppo SVG centrato in (x, y) con raggio r; etichetta facoltativa sotto
  function svg(id, x, y, r, opts) {
    var s = PER_ID[id]; if (!s) return '';
    opts = opts || {};
    var k = r / 13, out = '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')">';
    if (opts.chiaro) {   // per la stampa: quadratino bianco, bordo e icona neri
      out += '<rect x="' + (-r) + '" y="' + (-r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '" rx="' + (r * .25) + '" fill="#fff" stroke="#000" stroke-width="' + (r * .12) + '"/>';
      return out + '<g transform="scale(' + (k * .85).toFixed(3) + ')">' + s.disegno.replace(/#fff/g, '#000').replace(/#ffcf5a|#ff6b5e/g, '#000') + '</g></g>';
    }
    if (opts.sel) out += '<circle r="' + (r + 6 * (opts.k || k)) + '" fill="none" stroke="#ffd23f" stroke-width="' + (3 * (opts.k || k)) + '"/>';
    out += '<circle r="' + r + '" fill="#12150e" fill-opacity=".9" stroke="' + s.cat.colore + '" stroke-width="' + (2.2 * k) + '"/>';
    out += '<g transform="scale(' + (k * .85).toFixed(3) + ')">' + s.disegno + '</g></g>';
    if (opts.nome) out += '<text x="' + x.toFixed(1) + '" y="' + (y + r + 10 * (opts.k || k)).toFixed(1) + '" font-size="' + (12 * (opts.k || k)).toFixed(1) + '" text-anchor="middle" dominant-baseline="central" class="ed-lab" fill="' + s.cat.colore + '" paint-order="stroke" stroke="#000" stroke-width="' + (3 * (opts.k || k)).toFixed(1) + '">' + esc(opts.nome) + '</text>';
    return out;
  }
  // anteprima per i bottoni della palette
  function icona(id, px) { return '<svg viewBox="-15 -15 30 30" width="' + (px || 34) + '" height="' + (px || 34) + '">' + svg(id, 0, 0, 13) + '</svg>'; }
  window.AC_SIMB = { CATEGORIE: CATEGORIE, PER_ID: PER_ID, svg: svg, icona: icona };
})();
