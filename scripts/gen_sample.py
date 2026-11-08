"""Generate Tidewatch sample donor exports (fictional people, deterministic).

Four sources, four different formats, the way a small nonprofit really gets them:
  gmd-export.csv     online gifts (GiveMiamiDay.org days + monthly recurring)
  tickets.csv        event ticket orders
  gala-auction.csv   auction bidders, three years
  check-log.csv      paper checks typed in by hand

"Today" for the demo is 2026-11-08. Give Miami Day 2026 is 2026-11-19.
Run:  python3 scripts/gen_sample.py   (writes public/samples/*.csv)
"""
import csv, os, random
from datetime import date, timedelta

R = random.Random(7)
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "samples")
os.makedirs(OUT, exist_ok=True)

GMD = {2021: date(2021, 11, 18), 2022: date(2022, 11, 17), 2023: date(2023, 11, 16), 2024: date(2024, 11, 21), 2025: date(2025, 11, 20)}
FIRST = ["Maria", "Luis", "Camila", "Andres", "Valentina", "Diego", "Sofia", "Mateo", "Isabella", "Gabriel", "Daniela", "Javier",
         "Natalia", "Ricardo", "Elena", "Fernando", "Paola", "Hector", "Lucia", "Raul", "Wideline", "Jean-Marc", "Fabiola", "Reginald",
         "Nadege", "Patrick", "Stephanie", "Marcus", "Olivia", "Ethan", "Grace", "Noah", "Hannah", "Caleb", "Aaliyah", "Jordan",
         "Brianna", "Tyrone", "Kimberly", "Derek", "Monique", "Andre", "Simone", "Victor", "Yolanda", "Oscar", "Teresa", "Ivan",
         "Lauren", "Samuel", "Rebecca", "Adrian", "Chloe", "Miguel", "Ingrid", "Pablo", "Renee", "Arturo", "Bianca", "Esteban"]
LAST = ["Alonso", "Bermudez", "Cabrera", "Duarte", "Echeverria", "Figueroa", "Guzman", "Ibarra", "Jaramillo", "Lozano", "Medina",
        "Navarro", "Orozco", "Pacheco", "Quintero", "Rivas", "Salazar", "Tejada", "Urrutia", "Valencia", "Zamora", "Toussaint",
        "Jean-Louis", "Celestin", "Etienne", "Fleurimond", "Laguerre", "Saintil", "Brooks", "Coleman", "Dawson", "Ellison",
        "Fletcher", "Gaines", "Holloway", "Kincaid", "Lambert", "Mercer", "Norwood", "Pruitt", "Ramsey", "Sutton", "Whitaker",
        "Yancey", "Abrams", "Goldfarb", "Kessler", "Okafor", "Adeyemi", "Nakamura", "Tran", "Patel", "Haddad", "Rossi", "Lindqvist"]
STREETS = ["SW 8th St", "NW 7th St", "SW 22nd Ave", "NW 27th Ave", "Coral Way", "Flagler St", "NW 79th St", "NE 2nd Ave",
           "Biscayne Blvd", "SW 1st St", "NW 95th St", "SW 17th Ave", "Calle Ocho", "NW 103rd St", "Brickell Ave"]
ZIPS = ["33135", "33130", "33145", "33147", "33150", "33125", "33137", "33131", "33142", "33127"]
DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com", "hotmail.com", "aol.com"]
DESIG = ["Mentoring", "Family counseling", "School workshops", "Where most needed"]

used = set()
def person():
    while True:
        f, l = R.choice(FIRST), R.choice(LAST)
        if (f, l) not in used:
            used.add((f, l)); break
    num = R.randint(100, 9999)
    return {"first": f, "last": l, "email": f"{f.lower().replace('-', '')}.{l.lower().replace('-', '')}{R.choice(['', str(R.randint(1, 99))])}@{R.choice(DOMAINS)}",
            "phone": f"(305) 555-{R.randint(1000, 9999)}", "street": f"{num} {R.choice(STREETS)}", "zip": R.choice(ZIPS)}

gmd, tix, gala, chk = [], [], [], []
gid = [10000]
def g(p, d, amt, desig=None, recurring="No", status="Completed", name=None, email=None, phone=None, street=None):
    gid[0] += R.randint(3, 40)
    first, last = (name.split(" ", 1) if name else (p["first"], p["last"]))
    gmd.append({"Donation ID": f"GMD-{gid[0]}", "Donation Date": d.isoformat(), "Donor First Name": first, "Donor Last Name": last,
                "Email": p["email"] if email is None else email, "Phone": "" if phone is None and R.random() < .35 else (phone or p["phone"]),
                "Address": street or p["street"], "City": "Miami", "State": "FL", "Zip": p["zip"], "Amount": f"{amt:.2f}",
                "Designation": desig or R.choice(DESIG), "Recurring": recurring, "Status": status})
def t(p, d, event, ttype, qty, total, name=None, email=None):
    tix.append({"Order #": f"T{R.randint(100000, 999999)}", "Order Date": d.isoformat(), "Buyer Name": name or f"{p['first']} {p['last']}",
                "Buyer Email": email or p["email"], "Event": event, "Ticket Type": ttype, "Qty": qty, "Total": f"${total:,.2f}"})
def a(p, year, item, bid, name=None, email=None, phone=""):
    gala.append({"Bidder #": R.randint(10, 160), "Auction Year": year, "Name": name or f"{p['first']} {p['last']}",
                 "Email": email if email is not None else p["email"], "Phone": phone, "Item": item, "Winning Bid": bid})
def c(p, d, amt, memo="", name=None, street=None):
    chk.append({"Date Received": d.strftime("%m/%d/%Y"), "Check #": R.randint(1000, 9899), "Payer": name or f"{p['first']} {p['last']}",
                "Address": f"{street or p['street']}, Miami FL {p['zip']}", "Amount": f"{amt:,.2f}", "Memo": memo})

def months(start, end):
    d = start
    while d <= end:
        yield d
        m = d.month + 1; y = d.year + (m > 12); m = m - 12 if m > 12 else m
        d = date(y, m, min(d.day, 28))

# ---------- planted donors ----------
rosa = {"first": "Rosa", "last": "Delgado", "email": "rosa.delgado@gmail.com", "phone": "(305) 555-0142", "street": "1420 SW 8th St", "zip": "33135"}
for y, amt in [(2021, 100), (2023, 200), (2024, 250), (2025, 250)]:
    g(rosa, GMD[y], amt, "Mentoring", name="Rosa M. Delgado", phone="")
c(rosa, date(2024, 12, 12), 500, "Holiday gift", name="R. Delgado", street="1420 SW 8 Street")
c(rosa, date(2025, 12, 15), 500, "For the kids", name="R. Delgado", street="1420 SW 8 Street")
a(rosa, 2025, "Weekend in Key West", 150, name="Rosa Delgado", email="rosa.delgado@gmail.com")

theo = {"first": "Theodore", "last": "Baptiste", "email": "tbaptiste@icloud.com", "phone": "(305) 555-0177", "street": "8801 NW 7th Ave", "zip": "33150"}
for d in months(date(2025, 1, 5), date(2026, 7, 5)):
    g(theo, d, 150, "Mentoring", "Yes", phone="(305) 555-0177")
for d in [date(2026, 8, 5), date(2026, 9, 5), date(2026, 10, 5)]:
    g(theo, d, 150, "Mentoring", "Yes", "Declined", phone="(305) 555-0177")

kenji = {"first": "Kenji", "last": "Watanabe", "email": "kenji.w@outlook.com", "phone": "(305) 555-0119", "street": "1200 Brickell Ave", "zip": "33131"}
for d in months(date(2026, 1, 12), date(2026, 9, 12)):
    g(kenji, d, 75, "Where most needed", "Yes", phone="")
c(kenji, date(2025, 6, 2), 300, "Corporate match", name="Watanabe Consulting LLC", street="1200 Brickell Ave Ste 900")

priya = {"first": "Priya", "last": "Nair", "email": "priya.nair@gmail.com", "phone": "(305) 555-0164", "street": "301 NE 2nd Ave", "zip": "33137"}
for d in months(date(2025, 3, 20), date(2026, 6, 20)):
    g(priya, d, 40, "School workshops", "Yes")

for nm, amt, start in [("Mei Chen", 25, date(2025, 2, 1)), ("Dana Williams", 100, date(2025, 9, 1))]:
    f, l = nm.split(); p = {"first": f, "last": l, "email": f"{f.lower()}.{l.lower()}@gmail.com", "phone": f"(305) 555-{R.randint(2000, 9999)}", "street": f"{R.randint(100, 9999)} {R.choice(STREETS)}", "zip": R.choice(ZIPS)}
    for d in months(start, date(2026, 11, 1)):
        g(p, d, amt, "Where most needed", "Yes")

alv = {"first": "Alvarez", "last": "Family Fund", "email": "giving@alvarezfamilyfund.org", "phone": "(305) 555-0190", "street": "2600 S Bayshore Dr", "zip": "33133"}
a(alv, 2024, "Table for ten", 1500, name="Alvarez Family Fund", email="giving@alvarezfamilyfund.org")
a(alv, 2025, "Table for ten", 1500, name="The Alvarez Fam.", email="malvarez@alvarezfamilyfund.org")

marg = {"first": "Marguerite", "last": "Désir", "email": "", "phone": "", "street": "742 NE 125th St", "zip": "33161"}
c(marg, date(2022, 12, 8), 1000, "Joyeux Noel", name="Marguerite Désir")
c(marg, date(2023, 12, 11), 1000, "Joyeux Noel", name="Marguerite Désir")
c(marg, date(2024, 12, 9), 1000, "", name="M. Desir", street="742 NE 125 St")

josh = {"first": "Joshua", "last": "Carter", "email": "joshua.carter@gmail.com", "phone": "(305) 555-0133", "street": "55 SW 17th Ave", "zip": "33135"}
g(josh, GMD[2024], 100, "Mentoring"); g(josh, GMD[2025], 100, "Mentoring")
t(josh, date(2025, 3, 14), "Spring Social 2025", "Table", 1, 1500, name="Josh Carter", email="jcarter@cartergroup.com")

ana = {"first": "Ana", "last": "Castellanos", "email": "ana.castellanos@yahoo.com", "phone": "", "street": "", "zip": "33145"}
t(ana, date(2024, 9, 6), "Back to School Night 2024", "General", 2, 120)
t(ana, date(2025, 9, 5), "Back to School Night 2025", "General", 2, 120, name="A. Castellanos", email="acastellanos@miamidade.gov")
g(ana, GMD[2025], 60, "School workshops", street="3100 SW 22nd Ave")

jean = {"first": "Jean", "last": "Pierre-Louis", "email": "jean.pierrelouis@gmail.com", "phone": "(305) 555-0158", "street": "9400 NW 15th Ave", "zip": "33147"}
for y in (2023, 2024, 2025):
    g(jean, GMD[y], 50, "Family counseling")
other_jpl = {"first": "Joseph", "last": "Pierre-Louis", "email": "", "phone": "", "street": "1820 NE 135th St", "zip": "33181"}
c(other_jpl, date(2025, 4, 3), 200, "In memory of my mother", name="J. Pierre-Louis")

carmen = {"first": "Carmen", "last": "Fuentes", "email": "carmen.fuentes@outlook.com", "phone": "", "street": "", "zip": "33130"}
t(carmen, date(2024, 3, 15), "Spring Social 2024", "Patron", 2, 400)
t(carmen, date(2025, 3, 14), "Spring Social 2025", "Patron", 2, 400)

weiss = {"first": "Harold", "last": "Weiss", "email": "", "phone": "", "street": "4500 Pine Tree Dr", "zip": "33140"}
for y in (2022, 2023, 2024, 2025):
    c(weiss, date(y, 6, R.randint(3, 20)), 2000, "Annual gift", name="Dr. Harold Weiss")

herr = {"first": "Lucia", "last": "Herrera", "email": "herrerafamily@bellsouth.net", "phone": "(305) 555-0121", "street": "2240 Coral Way", "zip": "33145"}
for y in (2022, 2023, 2024, 2025):
    g(herr, GMD[y], 300, "Family counseling", name="Lucia & Tomas Herrera")

# ---------- everyone else (one-off or irregular givers) ----------
pool = [person() for _ in range(118)]
R.shuffle(pool)
gmd_people, tix_people, gala_people, chk_people = pool[:62], pool[40:78], pool[70:96], pool[92:118]
for p in gmd_people:
    years = R.sample([2021, 2022, 2023, 2024, 2025], R.choice([1, 1, 1, 2]))
    if len(years) == 2 and abs(years[0] - years[1]) == 1:
        years = years[:1]
    for y in years:
        g(p, GMD[y] + timedelta(days=R.choice([0, 0, 0, 1])), R.choice([10, 20, 25, 25, 50, 50, 75, 100, 100, 150, 250, 500]))
EVENTS = [(date(2024, 3, 15), "Spring Social 2024"), (date(2024, 9, 6), "Back to School Night 2024"), (date(2025, 3, 14), "Spring Social 2025"),
          (date(2025, 9, 5), "Back to School Night 2025"), (date(2026, 3, 13), "Spring Social 2026"), (date(2026, 9, 11), "Back to School Night 2026")]
for p in tix_people:
    d, ev = R.choice(EVENTS); q = R.choice([1, 2, 2, 4])
    t(p, d - timedelta(days=R.randint(1, 20)), ev, R.choice(["General", "General", "Patron"]), q, q * R.choice([60, 75, 100]))
ITEMS = ["Dinner for four at Versailles", "Marlins box seats", "Signed Heat jersey", "Spa day in Coconut Grove", "Art Basel VIP passes",
         "Cooking class", "Weekend in Key West", "Wynwood mural tour", "Fishing charter", "Orchid basket"]
for p in gala_people:
    a(p, R.choice([2024, 2025, 2026]), R.choice(ITEMS), R.choice([150, 200, 300, 450, 600, 800, 1200]), phone=p["phone"] if R.random() < .5 else "")
for p in chk_people:
    c(p, date(R.choice([2023, 2024, 2025, 2026]), R.randint(1, 10), R.randint(1, 27)), R.choice([25, 50, 100, 100, 200, 250, 500]), R.choice(["", "", "Donation", "In honor of", "For the kids"]))

# a few still-giving annual donors who already gave in their 2026 season (so not everyone is lapsing)
for _ in range(6):
    p = person()
    for y in (2024, 2025, 2026):
        a(p, y, R.choice(ITEMS), R.choice([300, 450, 600]), phone=p["phone"])

def write(name, rows):
    rows = sorted(rows, key=lambda r: list(r.values())[1] if name != "gala-auction.csv" else r["Auction Year"])
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print(f"{name:18s} {len(rows):4d} rows")

write("gmd-export.csv", gmd); write("tickets.csv", tix); write("gala-auction.csv", gala); write("check-log.csv", chk)
print("total", len(gmd) + len(tix) + len(gala) + len(chk))
