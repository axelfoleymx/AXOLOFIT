"""Fotos de técnica (posición inicial y final) desde Free Exercise DB (https://github.com/yuhonas/free-exercise-db,
licencia Unlicense). El emparejamiento es MANUAL y revisado: el automático por nombre producía fotos de otro ejercicio.
Los ejercicios sin pareja segura no llevan foto (solo el enlace a MuscleWiki).
Uso: python3 -I scripts/match_exercise_images.py fedb.json src/data/musclewiki.txt data/base44/Ejercicio.csv"""
import csv, json, sys

MAP = {
 'barbell-bench-press': 'Barbell_Bench_Press_-_Medium_Grip', 'dumbbell-bench-press': 'Dumbbell_Bench_Press', 'dumbbell-incline-bench-press': 'Incline_Dumbbell_Press',
 'barbell-incline-bench-press': 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'machine-chest-press': 'Leverage_Chest_Press', 'cable-chest-press': 'Cable_Chest_Press',
 'push-up': 'Pushups', 'incline-push-up': 'Incline_Push-Up', 'diamond-push-ups': 'Push-Ups_-_Close_Triceps_Position', 'dumbbell-chest-fly': 'Dumbbell_Flyes',
 'dumbbell-incline-chest-fly': 'Incline_Dumbbell_Flyes', 'cable-pec-fly': 'Cable_Crossover', 'cable-incline-chest-fly': 'Incline_Cable_Flye', 'machine-pec-fly': 'Butterfly',
 'box-dips': 'Dips_-_Chest_Version', 'bench-dips': 'Bench_Dips', 'smith-machine-bench-press': 'Smith_Machine_Bench_Press', 'smith-machine-incline-bench-press': 'Smith_Machine_Incline_Bench_Press',
 'smith-machine-close-grip-bench-press': 'Smith_Machine_Close-Grip_Bench_Press', 'barbell-close-grip-bench-press': 'Close-Grip_Barbell_Bench_Press',
 'pull-ups': 'Pullups', 'weighted-pull-ups': 'Weighted_Pull_Ups', 'chin-ups': 'Chin-Up', 'machine-pulldown': 'Wide-Grip_Lat_Pulldown', 'narrow-pulldown': 'Close-Grip_Front_Lat_Pulldown',
 'underhand-pulldown': 'Underhand_Cable_Pulldowns', 'barbell-bent-over-row': 'Bent_Over_Barbell_Row', 'dumbbell-row-unilateral': 'One-Arm_Dumbbell_Row',
 'machine-seated-cable-row': 'Seated_Cable_Rows', 'inverted-row': 'Inverted_Row', 'barbell-deadlift': 'Barbell_Deadlift', 'barbell-sumo-deadlift': 'Sumo_Deadlift',
 'barbell-romanian-deadlift': 'Romanian_Deadlift', 'dumbbell-romanian-deadlift': 'Stiff-Legged_Dumbbell_Deadlift', 'good-mornings': 'Good_Morning', 'band-good-morning': 'Band_Good_Morning',
 'machine-back-extension': 'Hyperextensions_Back_Extensions', 'machine-reverse-hyperextension': 'Reverse_Hyperextension',
 'barbell-overhead-press': 'Standing_Military_Press', 'dumbbell-seated-overhead-press': 'Seated_Dumbbell_Press', 'dumbbell-lateral-raise': 'Side_Lateral_Raise',
 'dumbbell-front-raise': 'Front_Dumbbell_Raise', 'plate-front-raise': 'Front_Plate_Raise', 'dumbbell-rear-delt-fly': 'Reverse_Flyes', 'machine-reverse-fly': 'Reverse_Machine_Flyes',
 'machine-face-pulls': 'Face_Pull', 'band-pull-apart': 'Band_Pull_Apart', 'barbell-upright-row': 'Upright_Barbell_Row', 'barbell-shrug': 'Barbell_Shrug', 'dumbbell-shrug': 'Dumbbell_Shrug',
 'barbell-curl': 'Barbell_Curl', 'barbell-reverse-curl': 'Reverse_Barbell_Curl', 'dumbbell-curl': 'Dumbbell_Bicep_Curl', 'dumbbell-hammer-curl': 'Hammer_Curls',
 'dumbbell-preacher-curl': 'Preacher_Curl', 'dumbbell-incline-curl': 'Incline_Dumbbell_Curl', 'cable-rope-pushdown': 'Triceps_Pushdown_-_Rope_Attachment',
 'machine-cable-v-bar-push-downs': 'Triceps_Pushdown_-_V-Bar_Attachment', 'dumbbell-skullcrusher': 'Lying_Dumbbell_Tricep_Extension', 'barbell-skullcrusher': 'Lying_Triceps_Press',
 'band-skullcrusher': 'Band_Skull_Crusher', 'dumbbell-seated-overhead-tricep-extension': 'Seated_Triceps_Press', 'cable-rope-overhead-tricep-extension': 'Cable_Rope_Overhead_Triceps_Extension',
 'dumbbell-wrist-curl': 'Seated_Dumbbell_Palms-Up_Wrist_Curl', 'cable-wrist-curl': 'Cable_Wrist_Curl', 'kettlebell-farmers-carry': 'Farmers_Walk',
 'barbell-squat': 'Barbell_Squat', 'barbell-front-squat-olympic': 'Front_Barbell_Squat', 'dumbbell-goblet-squat': 'Goblet_Squat', 'bodyweight-squat': 'Bodyweight_Squat',
 'smith-machine-squat': 'Smith_Machine_Squat', 'machine-leg-press': 'Leg_Press', 'dumbbell-bulgarian-split-squat': 'Split_Squat_with_Dumbbells', 'forward-lunges': 'Bodyweight_Walking_Lunge',
 'barbell-step-up': 'Barbell_Step_Ups', 'machine-leg-extension': 'Leg_Extensions', 'machine-hamstring-curl': 'Lying_Leg_Curls', 'machine-seated-leg-curl': 'Seated_Leg_Curl',
 'glute-ham-raise': 'Glute_Ham_Raise', 'barbell-hip-thrust': 'Barbell_Hip_Thrust', 'glute-bridge': 'Butt_Lift_Bridge', 'cable-standing-straight-leg-glute-glute-kickback': 'Glute_Kickback',
 'machine-hip-abduction': 'Thigh_Abductor', 'machine-hip-adduction': 'Thigh_Adductor', 'machine-standing-calf-raises': 'Standing_Calf_Raises', 'machine-seated-calf-raises': 'Seated_Calf_Raise',
 'barbell-seated-calf-raise': 'Barbell_Seated_Calf_Raise', 'dumbbell-calf-raise': 'Standing_Dumbbell_Calf_Raise', 'smith-machine-calf-raise': 'Smith_Machine_Calf_Raise',
 'kettlebell-swing': 'One-Arm_Kettlebell_Swings', 'kettlebell-windmill': 'Kettlebell_Windmill', 'crunches': 'Crunches', 'cable-rope-kneeling-crunch': 'Cable_Crunch',
 'laying-leg-raises': 'Flat_Bench_Lying_Leg_Raise', 'hand-plank': 'Plank', 'elbow-side-plank': 'Side_Bridge', 'cable-pallof-press': 'Pallof_Press', 'bodyweight-russian-twist': 'Russian_Twist',
}
BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
fedb = {x['id']: x for x in json.load(open(sys.argv[1], encoding='utf-8'))}
slugs = {l.split('~')[0] for l in open(sys.argv[2], encoding='utf-8').read().strip().split('\n')}
bad = [k for k, v in MAP.items() if v not in fedb or k not in slugs]
if bad:
    sys.exit(f'Emparejamientos inválidos: {bad}')

# Añade columnas de imagen a Ejercicio.csv (generado por export_base44.py)
rows = list(csv.reader(open(sys.argv[3], encoding='utf-8')))
head = [c for c in rows[0] if c not in ('imagen_inicio', 'imagen_fin', 'imagen_fuente')]
idx = rows[0].index('slug')
out = [head + ['imagen_inicio', 'imagen_fin', 'imagen_fuente']]
for r in rows[1:]:
    r = r[:len(head)]
    x = fedb.get(MAP.get(r[idx], ''))
    imgs = x['images'] if x else []
    out.append(r + [BASE + imgs[0] if imgs else '', BASE + imgs[1] if len(imgs) > 1 else '', 'Free Exercise DB (Unlicense)' if imgs else ''])
with open(sys.argv[3], 'w', newline='', encoding='utf-8') as f:
    csv.writer(f).writerows(out)
print(f'{sum(1 for r in out[1:] if r[-1])} de {len(out) - 1} ejercicios con foto')
