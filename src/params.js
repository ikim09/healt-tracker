// Parametri delle analisi del sangue con unità e intervalli di riferimento.
// I nomi qui sono le chiavi canoniche: i dati salvati e le traduzioni si basano su questi.
export const PARAMS = [
  {n:"Glicemia",u:"mg/dL",min:70,max:99},{n:"Colesterolo totale",u:"mg/dL",min:0,max:200},
  {n:"Colesterolo HDL",u:"mg/dL",min:40,max:null},{n:"Colesterolo LDL",u:"mg/dL",min:0,max:130},
  {n:"Trigliceridi",u:"mg/dL",min:0,max:150},{n:"Emoglobina",u:"g/dL",min:12,max:17.5},
  {n:"Ematocrito",u:"%",min:36,max:53},{n:"Globuli bianchi",u:"×10³/µL",min:4.5,max:11},
  {n:"Globuli rossi",u:"M/µL",min:4.5,max:5.9},{n:"Piastrine",u:"×10³/µL",min:150,max:400},
  {n:"Creatinina",u:"mg/dL",min:0.6,max:1.3},{n:"Urea",u:"mg/dL",min:10,max:50},
  {n:"AST/GOT",u:"U/L",min:0,max:40},{n:"ALT/GPT",u:"U/L",min:0,max:40},
  {n:"Gamma-GT",u:"U/L",min:0,max:55},{n:"TSH",u:"mUI/L",min:0.4,max:4},
  {n:"Ferro",u:"µg/dL",min:60,max:170},{n:"Ferritina",u:"ng/mL",min:12,max:300},
  {n:"VES",u:"mm/h",min:0,max:20},{n:"PCR",u:"mg/L",min:0,max:5},
  {n:"Vitamina D",u:"ng/mL",min:30,max:100},{n:"Vitamina B12",u:"pg/mL",min:200,max:900},
];
