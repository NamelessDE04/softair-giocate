/* Campi di gioco: immagine della mappa, georeferenziazione e punti di interesse.
   geo: pixel dell'immagine = cx[0]*lon + cx[1]*lat + cx[2] (x) e cy[0]*lon + cy[1]*lat + cy[2] (y),
   ricavato dalla griglia UTM della mappa (errore < 1 px). */
window.S40_CAMPI = {
  tauri: {
    nome: 'Campo Tauri',
    img: 'campi/tauri.jpg', w: 1460, h: 1560, mPerPx: 0.6763,
    geo: {
      cx: [116560.76093409663, 130.01904940639153, -869564.7514532728],
      cy: [45.43525065451297, -163892.83136121367, 7374129.636183583]
    },
    // tipo: mob | chiave | torre | deposito | base
    punti: [
      { id: 'HQ', nome: 'HQ', tipo: 'mob', lat: 44.988617, lon: 7.420605 },
      { id: 'Tral2', nome: 'Tral2', tipo: 'mob', lat: 44.993875, lon: 7.414877 },
      { id: 'Osservatorio', nome: 'Osservatorio', tipo: 'chiave', lat: 44.991715, lon: 7.415042 },
      { id: 'Giacim', nome: 'Giacim', tipo: 'chiave', lat: 44.992459, lon: 7.414415 },
      { id: 'Jaggernaut', nome: 'Jaggernaut', tipo: 'chiave', lat: 44.99185, lon: 7.417238 },
      { id: 'Scambio', nome: 'Scambio', tipo: 'base', lat: 44.991293, lon: 7.41307 },
      { id: 'Ponte1', nome: 'Ponte1', tipo: 'base', lat: 44.990903, lon: 7.412109 },
      { id: 'Tral3', nome: 'Tral3', tipo: 'torre', lat: 44.990658, lon: 7.410814 },
      { id: 'Tral1', nome: 'Tral1', tipo: 'torre', lat: 44.990831, lon: 7.4182 },
      { id: 'Pista', nome: 'Pista', tipo: 'base', lat: 44.990275, lon: 7.416983 },
      { id: 'Tridente', nome: 'Tridente', tipo: 'base', lat: 44.988433, lon: 7.417002 }
    ],
    // collegamenti di rete: si attacca solo un punto collegato a uno già tenuto
    link: [
      ['Tral2', 'Giacim'], ['Tral2', 'Ponte1'], ['Giacim', 'Osservatorio'], ['Giacim', 'Scambio'], ['Scambio', 'Ponte1'],
      ['Ponte1', 'Tral3'], ['Osservatorio', 'Jaggernaut'], ['Osservatorio', 'Pista'], ['Jaggernaut', 'Tral1'],
      ['Tral1', 'HQ'], ['Pista', 'HQ'], ['Pista', 'Tridente'], ['Tridente', 'HQ']
    ],
    // scenario proposto: la fazione di HQ parte con Pista (base avanzata) per bilanciare le distanze
    scenario: { mob: ['HQ', 'Tral2'], partenza: { HQ: ['Pista'], Tral2: [] } }
  }
};
