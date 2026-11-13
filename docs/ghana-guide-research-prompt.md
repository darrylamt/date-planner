# Research prompt: the Ghana guide, stay rates and missing fares

Paste everything below the line into the researcher. It returns CSV blocks I import. Nothing goes live until I have read it.

---

You are researching facts for Duro!, a Ghana app that plans outings and trips. Its assistant answers visitors' and locals' questions about being in Ghana, and it may only say what a source says. Accuracy matters more than coverage: leave a field blank rather than guess.

**Rules for every answer**
- Use 2026 sources. A 2025 source is acceptable only if nothing newer exists, and you must say so. Anything older is not used.
- Give the exact URL you read and the date the page shows (or "undated").
- Write in your own words. Do not copy sentences.
- Prices in Ghana cedis (GH¢) only, as the source prints them. Never convert dollars to cedis; if a source prints only dollars, put the dollar figure in the note and leave the cedi field blank.
- Mark confidence: high (official or the place's own site, 2026), medium (reputable news or a 2026 guide), low (anything else). Low rows are only listed, never used.
- End with a REPORT section listing what you could not find.

## Part A: settle six facts where sources disagree

One row each, with your evidence.

1. **Emergency numbers.** Which of these actually connect in 2026: 112, 191, 18555 (police), 192 (fire), 193 (ambulance), 999? Prefer the Ghana Police Service, the National Ambulance Service or the Ministry of Communications.
2. **Visa fees and visa on arrival.** Fees for the Ghana eVisa (tourist, single entry) and the ETA, by processing tier, from evisa.immigration.gov.gh or gis.gov.gh. Is visa on arrival still available in November 2026, and for whom?
3. **Border health declaration.** Is an online health declaration or Ebola screening required to enter Ghana in November 2026? Give the official form's URL.
4. **SIM cards for visitors.** Documents needed, where to register (airport?), and whether a visitor SIM is switched off after 30 days. Use the NCA's 2026 FAQ (nca.org.gh) or MTN, Telecel or AT.
5. **December in GH 2026.** Is the official end date 3 January or 25 January 2027? Give the official calendar's URL.
6. **Public holidays.** The official list for December 2026 and all of 2027 (Ministry of the Interior).

CSV: `topic,question,answer,source_url,source_date,confidence,note`

## Part B: everyday Ghana

For each topic, 2 to 5 facts a visitor would want, each one short. Correct anything that is wrong in Duro's drafts, which are at the end of this prompt.

- Greetings and etiquette (left hand, elders, dress, photographing people)
- Tipping and service charges (what a restaurant bill adds: VAT, NHIL, GETFund and other levies, with 2026 rates)
- Bargaining
- Mobile money: which wallets, can a visitor open one, limits
- Electricity: voltage, plug types, power cuts in 2026
- Drinking water: tap, bottled, sachet
- Phrases in Twi, Ga, Ewe and Dagbani: greeting, thank you, how much, yes, no, please (with correct spelling)
- Food: what the common dishes are and how they are eaten
- Festivals with their 2026 or 2027 dates: Homowo, Chale Wote, Fetu Afahye, Aboakyir, Hogbetsotso, Akwasidae (the 2027 dates), Kwahu Easter, PANAFEST
- Weather and seasons by region
- Safety at night by area, but only what police, a government or a reputable 2026 news report says: name the area and the source. Never "safe" or "unsafe" as your own opinion.

CSV: `topic,title,fact,source_url,source_date,confidence`

## Part C: rates for places to stay

Nightly room rates in cedis, from the stay's own website, a booking page showing GH¢, or a 2026 rate card. One row per room type.

- Mole Motel; Zaina Lodge (Mole National Park)
- Coconut Grove Beach Resort (Elmina); Oasis Beach Resort (Cape Coast); Hans Cottage Botel (near Kakum)
- Noda Hotel; Lancaster Kumasi City (Kumasi)
- The Royal Senchi (Akosombo)
- Pelican Hotel; La Palm Royal Beach Hotel; Best Western Plus Accra Beach (Accra)
- Ten more well-reviewed mid-priced hotels or guesthouses in Accra (Osu, Labone, Airport Residential, East Legon, Cantonments) with cedi rates.

CSV: `name,type,town,destination,what_it_is,entry_fee_ghs,entry_fee_visitor_ghs,price_per_night_ghs,room_name,price_note,price_source_url,price_seen,phone,website,confidence`
(type is "stay"; leave both entry fee columns blank.)

## Part D: entry fees in 2026

The fee for Ghanaians and for non-Ghanaians, in cedis, for:

- Kakum canopy walkway; Shai Hills Resource Reserve; Aburi Botanical Gardens
- Boti Falls; Wli Waterfalls; Tafi Atome Monkey Sanctuary; Mount Afadjato
- Paga crocodile pond; Larabanga Mosque; Wechiau Hippo Sanctuary; Boabeng-Fiema
- Bobiri Butterfly Sanctuary; Assin Manso; Nzulezo; Kintampo Falls; Mole National Park (2026 table)
- Legon Botanical Gardens
- The Ghana Museums and Monuments Board's revised fees, if a revision after July 2023 exists

Use the same CSV as Part C, with type "activity" or "outdoor" and the fee columns filled.

## Part E: fares between regional towns

2026 bus fares between towns other than Accra, from STC, VIP Jeoun, Metro Mass or a GPRTU station list:

- Kumasi to Cape Coast, Takoradi, Sunyani, Techiman, Kintampo, Tamale, Bolgatanga and Ho
- Cape Coast to Takoradi
- Tamale to Bolgatanga, Wa and Mole (Damongo or Larabanga)
- Ho to Hohoe; Hohoe to Wli
- Bolgatanga to Paga

CSV: `from_town,to_town,operator,service,fare_ghs,duration_mins,departures,source_url,source_date,confidence`

## Part F: December 2026 ticket prices

Ticket prices (each tier, in GH¢) and start times for these December in GH 2026 events:

- BHIM Festival (24 Dec, University of Ghana Sports Stadium)
- The Convention (20 Dec, Underbridge Annex)
- Fufu Party (12 Dec)
- Ghana-Jamaica Homecoming (4–5 Dec)
- Christmas in Wonderland (Zen Garden)
- KIDDAFEST (17 Dec)
- Roverman Festival of Plays (24 Dec–4 Jan)
- A Night of 1033 Laughs and Music (26 Dec)
- Regal Film Festival (8 Dec)
- AfroFuture 2026: dates, venue and prices
- Any other ticketed event on the official calendar

CSV: `title,date,start_time,venue,town,tier,price_ghs,ticket_url,source_url,source_date,confidence`

## Duro's drafts to correct

Correct each one or confirm it.

1. Greet before asking anything; shake hands from your right; elders first.
2. Give, take and eat with the right hand.
3. Modest dress; swimwear only at the beach or pool; dress up for upscale bars.
4. GMT all year; events start late, but transport leaves on time.
5. Twi: Akwaaba (welcome), Maakye (good morning), Maaha (good afternoon), Maadwo (good evening), Ɛte sɛn? (how are you?), Me ho yɛ (I'm fine), Medaase (thank you), Aane (yes), Daabi (no), Ɛyɛ sɛn? (how much?), Mepa wo kyɛw (please).
6. Ga: Ojekoo (well done, a greeting), Oyiwaladonn (thank you).
7. Tipping: about 10% at sit-down restaurants without a service charge; round up for drivers.
8. Mobile money needs a registered Ghanaian SIM.
9. 230 V; UK three-pin (G) sockets mostly, some type D.
10. Drink bottled or sachet water.
11. Festivals: Homowo August–September; Chale Wote in August; Fetu Afahye on the first Saturday of September; Aboakyir in May; Hogbetsotso in November; Akwasidae every six weeks.
12. Southern rains April–June and September–October; northern rains May–October; harmattan December–February.
