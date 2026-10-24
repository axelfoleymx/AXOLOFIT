"""Convierte los CSV exportados de Nutrion (Base44) en catálogos JSON normalizados para ATHLETIQ.
Uso: python3 -I scripts/import_catalogs.py data-src src/data
Los valores del catálogo vienen por porción estándar; aquí se normalizan a 100 g."""
import csv, json, sys, os

src, out = sys.argv[1], sys.argv[2]

def num(v):
    try:
        return float(v) if v not in ("", None) else None
    except ValueError:
        return None

def rows(name):
    return list(csv.DictReader(open(os.path.join(src, f"{name}_export.csv"), encoding="utf-8")))

def r1(x):
    return None if x is None else round(x, 2)

foods = []
seen_ids = set()
# El export de Base44 repite cada alimento varias veces con el mismo id_alimento: se conserva uno.
for r in sorted(rows("Alimento"), key=lambda r: r["updated_date"], reverse=True):
    if r["id_alimento"] in seen_ids:
        continue
    seen_ids.add(r["id_alimento"])
    g = num(r["porcion_estandar_g"])
    if not g or g <= 0:
        continue
    f = 100.0 / g
    kcal, p, c, fat, fib = (num(r[k]) for k in ("kcal_por_porcion", "proteina_g", "carbohidratos_g", "grasa_g", "fibra_g"))
    per = {k: r1(v * f) if v is not None else None for k, v in (("kcal", kcal), ("protein", p), ("carbs", c), ("fat", fat), ("fiber", fib))}
    # Coherencia Atwater (4/4/9): marca entradas cuya energía declarada difiere >25 % de la calculada.
    flag = None
    if None not in (kcal, p, c, fat) and kcal > 20:
        atw = 4 * p + 4 * c + 9 * fat
        if abs(atw - kcal) / kcal > 0.25:
            flag = "kcal_inconsistente"
    foods.append({
        "id": f"mx-{r['id_alimento']}", "name": r["nombre"].strip(), "category": r["tipo_alimento"],
        "per100g": per, "servingG": g, "notes": r["notas"] or None,
        "priceMxnKg": num(r["precio_mxn_aprox_kg"]), "priceRange": r["rango_precio"] or None,
        "availability": r["disponibilidad"] or None, "season": r["temporada"] or None,
        "flag": flag,
    })
food_ids = {x["id"] for x in foods}

recipes = []
seen_names = set()
for r in rows("RecetaMexicana"):
    key = (r["nombre"].strip().lower(), r["ingredientes"])
    if key in seen_names:
        continue
    seen_names.add(key)
    ing = [{"foodId": f"mx-{i['alimento_id']}", "grams": float(i["gramos"])} for i in json.loads(r["ingredientes"]) if i.get("gramos")]
    if not ing or any(i["foodId"] not in food_ids for i in ing):
        continue
    recipes.append({
        "id": f"rx-{r['id']}", "name": r["nombre"].strip(), "mealType": r["tipo_comida"] if r["tipo_comida"] != "snack" else "colacion",
        "ingredients": ing, "prepMin": num(r["tiempo_preparacion_min"]), "difficulty": r["dificultad"] or None,
        "tags": json.loads(r["tags"] or "[]"), "instructions": r["preparacion"] or None, "priceRange": r["rango_precio"] or None,
    })

drinks = []
seen_d = set()
for r in rows("BebidaMexicana"):
    if r["id_bebida"] in seen_d:
        continue
    seen_d.add(r["id_bebida"])
    ml = num(r["porcion_ml"]) or 250
    drinks.append({
        "id": f"bx-{r['id_bebida']}", "name": r["nombre"], "category": r["categoria"], "servingMl": ml,
        "kcal": num(r["kcal_por_porcion"]), "sugarG": num(r["azucar_g"]), "caffeineMg": num(r["cafeina_mg"]),
        "alcoholPct": num(r["alcohol_pct"]), "healthProfile": r["perfil_salud"], "cautions": r["padecimientos_precaucion"],
        "notes": r["notas"], "season": r["temporada"],
    })

just, jidx, conds = [], {}, {}
for r in rows("EnfermedadAlimento"):
    fid = f"mx-{r['alimento_id']}"
    if fid not in food_ids:
        continue
    j = r["justificacion"]
    if j not in jidx:
        jidx[j] = len(just); just.append(j)
    c = conds.setdefault(r["enfermedad"], {"recomendado": [], "moderado": [], "evitar": []})
    lst = c.setdefault(r["recomendacion"], [])
    if not any(x[0] == fid for x in lst):
        lst.append([fid, jidx[j]])

learn = []
for r in rows("EducacionAprende"):
    learn.append({k: r[k] for k in ("clave", "tipo_contenido", "nombre_visible", "resumen_simple", "alimentos_preferir", "alimentos_moderar",
                                    "alimentos_evitar", "bebidas_preferir", "bebidas_evitar", "como_balancear_plato", "tips_practicos",
                                    "mitos_comunes", "si_comes_fuera", "senales_alerta", "disclaimer")})
tips = []
for r in rows("EducacionMetaNutricional"):
    tips.append({"goal": r["clave_meta"], "category": r["categoria"], "title": r["titulo"], "content": r["contenido"],
                 "tip": r["tip_practico"], "better": r["ejemplo_mejor_eleccion"], "worse": r["ejemplo_menos_recomendable"]})

def dump(name, obj):
    with open(os.path.join(out, name), "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))

dump("foods-mx.json", foods)
dump("recipes-mx.json", recipes)
dump("drinks-mx.json", drinks)
dump("conditions-mx.json", {"justifications": just, "conditions": conds})
dump("education-mx.json", {"learn": learn, "tips": tips})
print(len(foods), "alimentos;", sum(1 for f in foods if f["flag"]), "con kcal inconsistente;", len(recipes), "recetas;", len(drinks), "bebidas;", len(conds), "condiciones")
