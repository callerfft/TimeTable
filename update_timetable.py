"""
Скрипт синхронизации расписания BMU с портала bmutimetable.edupage.org
Использование: python update_timetable.py
"""

import urllib.request
import http.cookiejar
import re
import json
from collections import defaultdict

EDUPAGE_BASE = 'https://bmutimetable.edupage.org'

def fetch_latest_timetable():
    print("[1/3] Подключение к EduPage и получение сессии...")
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': f'{EDUPAGE_BASE}/timetable/',
        'Content-Type': 'application/json; charset=utf-8'
    }

    req_page = urllib.request.Request(f'{EDUPAGE_BASE}/timetable/', headers={
        'User-Agent': headers['User-Agent'],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    })
    with opener.open(req_page) as resp:
        html = resp.read().decode('utf-8', errors='ignore')

    gsh_match = re.search(r'ASC\.gsechash\s*=\s*["\']([^"\']+)["\']', html)
    gsh = gsh_match.group(1) if gsh_match else "00000000"

    # Get active timetable ID
    ttviewer_url = f'{EDUPAGE_BASE}/timetable/server/ttviewer.js?__func=getTTViewerData'
    body_meta = json.dumps({"__args": [None, 2026], "__gsh": gsh, "__client_redirect": None}).encode('utf-8')
    req_meta = urllib.request.Request(ttviewer_url, data=body_meta, headers=headers)
    
    with opener.open(req_meta) as resp_meta:
        meta_res = json.loads(resp_meta.read().decode('utf-8'))
        active_tt_num = meta_res.get('r', {}).get('regular', {}).get('default_num', '7')
        print(f"[2/3] Найдено актуальное расписание: #{active_tt_num}")

    # Fetch full timetable
    regulartt_url = f'{EDUPAGE_BASE}/timetable/server/regulartt.js?__func=regularttGetData'
    body_data = json.dumps({"__args": [None, str(active_tt_num)], "__gsh": gsh, "__client_redirect": None}).encode('utf-8')
    req_data = urllib.request.Request(regulartt_url, data=body_data, headers=headers)

    with opener.open(req_data) as resp_data:
        raw_res = resp_data.read().decode('utf-8')
        with open('timetable_raw.json', 'w', encoding='utf-8') as f:
            f.write(raw_res)

    print("[3/3] Генерация timetable_data.js...")
    compile_data(json.loads(raw_res))
    print("Готово! Данные обновлены успешно.")

def compile_data(raw):
    tables = {t['id']: {row['id']: row for row in t['data_rows']} for t in raw['r']['dbiAccessorRes']['tables']}

    sorted_periods = sorted(tables['periods'].values(), key=lambda x: int(x.get('period', 0)))
    periods = [
        {
            'id': int(p.get('period')),
            'start': p.get('starttime', ''),
            'end': p.get('endtime', ''),
            'time': f"{p.get('starttime', '')} - {p.get('endtime', '')}"
        }
        for p in sorted_periods
    ]
    period_times = {p['id']: p for p in periods}

    days = [
        {'id': 0, 'name': 'Понедельник', 'short': 'Пн', 'en': 'Monday'},
        {'id': 1, 'name': 'Вторник', 'short': 'Вт', 'en': 'Tuesday'},
        {'id': 2, 'name': 'Среда', 'short': 'Ср', 'en': 'Wednesday'},
        {'id': 3, 'name': 'Четверг', 'short': 'Чт', 'en': 'Thursday'},
        {'id': 4, 'name': 'Пятница', 'short': 'Пт', 'en': 'Friday'}
    ]

    def classify_room(name):
        lower = name.lower()
        if 'lecture' in lower:
            return 'lecture', 'Лекционный зал'
        elif 'computer' in lower:
            return 'computer', 'Компьютерный класс'
        elif 'seminar' in lower:
            return 'seminar', 'Семинарская аудитория'
        return 'other', 'Аудитория'

    def get_floor(name):
        for token in name.split():
            for ch in token:
                if ch in ('D', 'd'):
                    idx = token.find(ch)
                    if idx + 1 < len(token) and token[idx+1].isdigit():
                        return int(token[idx+1])
        return 0

    classrooms_list = []
    for cid, c in tables['classrooms'].items():
        name = c.get('name', c.get('short', ''))
        short = c.get('short', name)
        rtype, rtype_label = classify_room(name)
        classrooms_list.append({
            'id': cid,
            'name': name,
            'short': short,
            'type': rtype,
            'typeLabel': rtype_label,
            'floor': get_floor(name),
            'color': c.get('color', '#1565C0')
        })

    classrooms_list.sort(key=lambda x: (x['floor'], x['type'], x['name']))

    classes_list = []
    classes_map = {}
    for cid, c in tables['classes'].items():
        cname = c.get('name', c.get('short', ''))
        classes_map[cid] = cname
        classes_list.append({'id': cid, 'name': cname, 'short': c.get('short', cname)})
    classes_list.sort(key=lambda x: x['name'])

    teachers_map = {tid: t.get('short', t.get('name', '')) for tid, t in tables['teachers'].items()}
    subjects_map = {sid: s.get('name', s.get('short', '')) for sid, s in tables['subjects'].items()}

    cards = list(tables['cards'].values())
    lessons = tables['lessons']

    room_schedule = defaultdict(lambda: defaultdict(dict))
    class_schedule = defaultdict(lambda: defaultdict(dict))

    for card in cards:
        lesson = lessons.get(card['lessonid'])
        if not lesson:
            continue
        
        room_ids = card.get('classroomids') or lesson.get('classroomids') or []
        days_mask = card.get('days', '00000')
        start_p = int(card.get('period', 0))
        duration = int(lesson.get('durationperiods', 1))
        
        subj_name = subjects_map.get(lesson.get('subjectid'), 'Занятие')
        t_names = [teachers_map.get(tid, tid) for tid in lesson.get('teacherids', [])]
        c_names = [classes_map.get(cid, cid) for cid in lesson.get('classids', [])]
        r_names = [tables['classrooms'].get(rid, {}).get('name', rid) for rid in room_ids]
        
        end_p = start_p + duration - 1
        t_start = period_times.get(start_p, {}).get('start', '')
        t_end = period_times.get(end_p, {}).get('end', '')
        time_str = f"{t_start} - {t_end}"
        
        active_days = [i for i, bit in enumerate(days_mask[:5]) if bit == '1']
        
        entry = {
            'cardId': card['id'],
            'lessonId': lesson['id'],
            'subject': subj_name,
            'teachers': t_names,
            'groups': c_names,
            'rooms': r_names,
            'startPeriod': start_p,
            'endPeriod': end_p,
            'duration': duration,
            'timeRange': time_str
        }
        
        for day in active_days:
            for p in range(start_p, start_p + duration):
                for rid in room_ids:
                    room_schedule[rid][day][p] = {**entry, 'isPrimary': (p == start_p)}
                for cid in lesson.get('classids', []):
                    class_schedule[cid][day][p] = {**entry, 'isPrimary': (p == start_p)}

    export_data = {
        'periods': periods,
        'days': days,
        'classrooms': classrooms_list,
        'classes': classes_list,
        'roomSchedule': room_schedule,
        'classSchedule': class_schedule,
        'meta': {
            'university': 'British Management University in Tashkent',
            'source': 'bmutimetable.edupage.org'
        }
    }

    with open('timetable_data.js', 'w', encoding='utf-8') as f:
        f.write('const TIMETABLE_DATA = ' + json.dumps(export_data, ensure_ascii=False, indent=2) + ';\n')

if __name__ == '__main__':
    fetch_latest_timetable()
