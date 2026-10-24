"""Genera CSV listos para importar en Base44 (sin duplicados ni datos personales como created_by).
Uso: python3 -I scripts/export_base44.py src/data data/base44"""
import csv, json, os, sys
src, out = sys.argv[1], sys.argv[2]
L = lambda n: json.load(open(os.path.join(src, n), encoding='utf-8'))
def write(name, header, rows):
    with open(os.path.join(out, name), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)
    print(name, len(rows))

foods = L('foods-mx.json')
write('Alimento.csv', ['id_alimento','nombre','tipo_alimento','kcal_100g','proteina_100g','carbohidratos_100g','grasa_100g','fibra_100g','porcion_estandar_g','notas','precio_mxn_aprox_kg','rango_precio','disponibilidad','temporada','alerta_calidad'],
      [[f['id'].removeprefix('mx-'), f['name'], f['category'], *(f['per100g'].get(k) for k in ('kcal','protein','carbs','fat','fiber')), f['servingG'], f['notes'] or '', f['priceMxnKg'] or '', f['priceRange'] or '', f['availability'] or '', f['season'] or '', f['flag'] or ''] for f in foods])
names = {f['id']: f['name'] for f in foods}
recipes = L('recipes-mx.json')
write('RecetaMexicana.csv', ['id_receta','nombre','tipo_comida','ingredientes_json','tiempo_preparacion_min','dificultad','rango_precio','tags','preparacion'],
      [[r['id'].removeprefix('rx-'), r['name'], r['mealType'], json.dumps([{'alimento_id': i['foodId'].removeprefix('mx-'), 'nombre_alimento': names[i['foodId']], 'gramos': i['grams']} for i in r['ingredients']], ensure_ascii=False), r['prepMin'] or '', r['difficulty'] or '', r['priceRange'] or '', ','.join(r['tags']), r['instructions'] or ''] for r in recipes])
drinks = L('drinks-mx.json')
write('BebidaMexicana.csv', ['id_bebida','nombre','categoria','porcion_ml','kcal_por_porcion','azucar_g','cafeina_mg','alcohol_pct','perfil_salud','padecimientos_precaucion','notas','temporada'],
      [[d['id'].removeprefix('bx-'), d['name'], d['category'], d['servingMl'], d['kcal'], d['sugarG'], d['caffeineMg'], d['alcoholPct'], d['healthProfile'], d['cautions'], d['notes'], d['season']] for d in drinks])
c = L('conditions-mx.json')
rows = []
for cond, groups in c['conditions'].items():
    for rec, lst in groups.items():
        for fid, j in lst: rows.append([cond, fid.removeprefix('mx-'), names.get(fid, ''), rec, c['justifications'][j]])
write('EnfermedadAlimento.csv', ['enfermedad','alimento_id','nombre_alimento','recomendacion','justificacion'], rows)
edu = L('education-mx.json')
keys = list(edu['learn'][0].keys())
write('EducacionAprende.csv', keys, [[l[k] for k in keys] for l in edu['learn']])
write('EducacionMetaNutricional.csv', ['clave_meta','categoria','titulo','contenido','tip_practico','ejemplo_mejor_eleccion','ejemplo_menos_recomendable'],
      [[t['goal'], t['category'], t['title'], t['content'], t['tip'], t['better'], t['worse']] for t in edu['tips']])

M = {'pe':'Pecho','do':'Dorsales','em':'Espalda media','tp':'Trapecio','lu':'Zona lumbar','hf':'Deltoides anterior','hl':'Deltoides lateral','hp':'Deltoides posterior','bi':'Bíceps','tr':'Tríceps','an':'Antebrazos','cu':'Cuádriceps','is':'Isquiotibiales','gl':'Glúteos','ge':'Gemelos','ad':'Aductores','ab':'Abdominales','ob':'Oblicuos'}
E = ['Barra','Peso corporal','Mancuernas','Máquina','Polea','Kettlebell','Banda','Máquina Smith','Disco','TRX']
D = ['Principiante','Principiante','Intermedio','Avanzado']
ex = []
for line in open(os.path.join(src, 'musclewiki.txt'), encoding='utf-8').read().strip().split('\n'):
    slug, name, eq, diff, force, mech, prim, sec = line.split('~')
    ex.append([slug, name, E[int(eq)], D[int(diff)], {'P':'Empuje/Tracción','H':'Isométrico'}.get(force,''), {'c':'Compuesto','i':'Aislamiento'}.get(mech,''),
               ', '.join(M[m] for m in prim.split(',') if m), ', '.join(M[m] for m in sec.split(',') if m), f'https://musclewiki.com/es-es/exercise/{slug}'])
write('Ejercicio.csv', ['slug','nombre','equipamiento','dificultad','fuerza','mecanica','musculos_principales','musculos_secundarios','url_musclewiki'], ex)
