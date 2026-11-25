# Demo scripts

Een demo-account voor een geïnteresseerde zaak, in vijf stappen. De volledige werkwijze staat in de skill `nieuwe-demo` (`/Users/simon/Developer/.claude/skills/nieuwe-demo/SKILL.md`).

| Script | Wat |
| --- | --- |
| `create-account.mjs <config>` | account op productie, openingsuren, massages/kamers/therapeuten, plattegrond |
| `floor-plan.mjs <config>` | alleen de plattegrond opnieuw tekenen |
| `render-plan.mjs <config> <map>` | plattegrond als SVG, om te controleren |
| `seed.mjs <config>` | agenda met historiek, klanten, betalingen, AI-gesprekken (opnieuw uitvoerbaar) |
| `vapi-switch.mjs <config> [--dry-run]` | het gedeelde demonummer +32 460 23 71 90 naar deze zaak (database), keyterms, en controle bij de backend. Aan de assistants verandert niets |
| `remove-customer.mjs <config> "Naam"` | testklant met afspraken en gesprekken weg |

Configs staan in `demos/` (niet in git). Voorbeeld: `demos/volckerick.json`.
Vapi werkt multi-tenant (zie `vapi/README.md`): één sjabloon-assistant per type (`vapi/prompts/`), de backend vult bij elke oproep de naam, de openingsdagen en (massage) de soorten massages in van de zaak die bij het gebelde nummer hoort. Een demo omzetten is dus alleen het nummer in de database verplaatsen; dat duurt tot 2 minuten (cache).

Klanten (`vapi/customers.json`) weigert elk script.

Wachtwoorden komen in `demo-logins.local.txt` (niet in git).

Nummers: +32 460 23 71 90 = gedeeld demonummer (massage én restaurant, laatste demo wint). +32 460 25 28 25 = In A Sense (Cindy), klant, nooit omzetten. +32 460 25 10 45 = live demo op de website.
