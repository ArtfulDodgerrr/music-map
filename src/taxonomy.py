"""
Hand-curated genre taxonomy for the music map.
Structure: family -> cluster -> subgroup -> [artist names]

Each cluster has a color (hex) and caption (short label string).
Artist names must match exactly what's in private/library.json.
"""

# fmt: off
TAXONOMY = {
    "TRAP": {
        "Atlanta Trap": {
            "color": "#e63946",
            "caption": "trap · ATL · melodic rap",
            "subgroups": {
                "ATL Core":    ["Future", "Young Thug", "Gunna", "21 Savage", "Metro Boomin",
                                "Young Nudy", "Pi’erre Bourne", "Migos", "2 Chainz",
                                "SahBabii", "Quavo", "Young Stoner Life"],
                "New South":   ["Lil Baby", "Don Toliver", "Lil Durk", "Rod Wave",
                                "NBA YoungBoy", "Roddy Ricch"],
            },
        },
        "Rage & New Wave": {
            "color": "#ff6b35",
            "caption": "rage rap · hyperpop adjacent · new wave",
            "subgroups": {
                "Rage":        ["Playboi Carti", "Ken Carson", "Yeat", "Destroy Lonely",
                                "Bladee"],
                "Emo Rap":     ["Lil Uzi Vert", "Juice WRLD", "XXXTentacion"],
            },
        },
        "Drill": {
            "color": "#c1121f",
            "caption": "drill · Chicago · UK · street rap",
            "subgroups": {
                "Chicago":     ["Chief Keef", "G Herbo"],
                "NY / Detroit":["Fivio Foreign", "Glokk40Spaz", "Rio Da Yung Og",
                                "Pop Smoke"],
                "UK":          ["EsDeeKid", "Nemzzz"],
            },
        },
    },

    "HIP-HOP": {
        "Lyrical / Classic": {
            "color": "#1d3557",
            "caption": "lyrical · conscious · classic hip-hop",
            "subgroups": {
                "West Coast":  ["Kendrick Lamar", "2Pac"],
                "East Coast":  ["JAY-Z", "Outkast", "J. Cole", "Nas", "Rakim",
                                "Joey Bada$$", "Lil Wayne", "Rick Ross", "Clipse",
                                "The LOX", "MIKE", "Pusha T"],
                "Alt Rap":     ["Earl Sweatshirt", "Tyler, The Creator", "MF DOOM",
                                "Chance the Rapper"],
            },
        },
        "Kanye Orbit": {
            "color": "#457b9d",
            "caption": "GOOD Music · soul samples · psychedelic rap",
            "subgroups": {
                "GOOD Music":  ["Kanye West"],
                "Camp":        ["Kid Cudi", "Ty Dolla $ign", "Big Sean"],
            },
        },
        "Drake / OVO": {
            "color": "#023e8a",
            "caption": "OVO Sound · Toronto R&B-rap",
            "subgroups": {
                "OVO":         ["Drake", "PARTYNEXTDOOR"],
                "Toronto":     ["The Weeknd"],
            },
        },
        "Eclectic Rap": {
            "color": "#3a86ff",
            "caption": "rockstar rap · genre-blending · art rap",
            "subgroups": {
                "Rockstar":    ["Travis Scott", "A$AP Rocky", "A$AP Mob", "A$AP Ferg",
                                "A$AP NAST"],
                "Internet Era":["Lil Yachty", "Fimiguerrero", "Teezo Touchdown"],
            },
        },
    },

    "INTERNET RAP": {
        "Cloud Rap": {
            "color": "#7209b7",
            "caption": "cloud rap · jerk · SoundCloud underground",
            "subgroups": {
                "Cloud / Plugg":    ["LUCKI", "fakemink", "ksuuvi", "Summrs",
                                     "xaviersobased", "Cash Cobain", "Nettspend",
                                     "Warhol.SS", "B6", "sn7", "SURF GANG",
                                     "Concrete Boys"],
                "Internet Rap":     ["JELEEL!", "svnti", "Icez", "Protect",
                                     "untiljapan", "Benji Blue Bills", "Rian Brazil",
                                     "Ekebabyy", "Pz'", "zayok", "1010benja",
                                     "ridgeclub", "janu4ryss", "Swapa"],
            },
        },
    },

    "R&B & SOUL": {
        "Alt R&B": {
            "color": "#f72585",
            "caption": "alternative R&B · neo-soul · bedroom pop",
            "subgroups": {
                "Neo-Soul":    ["Frank Ocean", "Steve Lacy", "Dijon", "Mk.gee",
                                "PinkPantheress", "Solange", "Thundercat",
                                "Anderson .Paak", "Pharrell Williams", "Stevie Wonder"],
                "Underground": ["Saraphina Echoes", "Ledbyher", "Julia Wolf",
                                "Clara La San", "Summer Walker"],
            },
        },
        "R&B / Auto-Tune": {
            "color": "#b5179e",
            "caption": "R&B · pop rap · classic auto-tune era",
            "subgroups": {
                "Pop R&B":     ["T-Pain", "Chris Brown", "USHER", "SZA"],
            },
        },
    },

    "ELECTRONIC": {
        "IDM & Ambient": {
            "color": "#00b4d8",
            "caption": "IDM · ambient · glitch · experimental electronic",
            "subgroups": {
                "IDM":         ["Aphex Twin", "Boards of Canada", "KAYTRANADA"],
                "Ambient":     ["my head is empty", "ksuuvi"],
                "Internet":    ["untiljapan", "SYSTEM SEOUL"],
            },
        },
    },

    "JAZZ & FOLK": {
        "Jazz": {
            "color": "#52b788",
            "caption": "jazz · nu jazz · jazztronica · lo-fi",
            "subgroups": {
                "Nu Jazz":     ["Anatole Muster", "Kiefer", "J.P.", "Daryl Johns"],
                "Bossa Nova":  ["João Gilberto", "Gilberto Gil"],
            },
        },
        "Rock & Folk": {
            "color": "#f9c74f",
            "caption": "rock · folk · psychedelic · indie",
            "subgroups": {
                "Psychedelic": ["Jimi Hendrix", "System Of A Down"],
                "Indie Folk":  ["Bon Iver", "Alex G", "Adrianne Lenker"],
            },
        },
    },
}
# fmt: on
