"""English short names for ISO 3166-1 alpha-2 codes used by the visa guide and invitation letters."""

from __future__ import annotations

COUNTRY_NAMES: dict[str, str] = {
    "AD": "Andorra", "AE": "United Arab Emirates", "AF": "Afghanistan", "AG": "Antigua and Barbuda",
    "AI": "Anguilla", "AL": "Albania", "AM": "Armenia", "AO": "Angola", "AR": "Argentina", "AT": "Austria",
    "AU": "Australia", "AW": "Aruba", "AZ": "Azerbaijan", "BA": "Bosnia and Herzegovina", "BB": "Barbados",
    "BD": "Bangladesh", "BE": "Belgium", "BG": "Bulgaria", "BH": "Bahrain", "BI": "Burundi", "BJ": "Benin",
    "BN": "Brunei", "BO": "Bolivia", "BR": "Brazil", "BS": "Bahamas", "BT": "Bhutan", "BW": "Botswana",
    "BY": "Belarus", "BZ": "Belize", "CA": "Canada", "CH": "Switzerland", "CI": "Cote d'Ivoire",
    "CK": "Cook Islands", "CL": "Chile", "CM": "Cameroon", "CN": "China", "CO": "Colombia",
    "CR": "Costa Rica", "CU": "Cuba", "CV": "Cabo Verde", "CY": "Cyprus", "CZ": "Czechia", "DE": "Germany",
    "DJ": "Djibouti", "DK": "Denmark", "DM": "Dominica", "DO": "Dominican Republic", "DZ": "Algeria",
    "EC": "Ecuador", "EE": "Estonia", "EG": "Egypt", "ER": "Eritrea", "ES": "Spain", "ET": "Ethiopia",
    "FI": "Finland", "FJ": "Fiji", "FM": "Micronesia", "FR": "France", "GA": "Gabon",
    "GB": "United Kingdom", "GD": "Grenada", "GE": "Georgia", "GH": "Ghana", "GM": "Gambia", "GN": "Guinea",
    "GQ": "Equatorial Guinea", "GR": "Greece", "GT": "Guatemala", "GY": "Guyana", "HK": "Hong Kong",
    "HN": "Honduras", "HR": "Croatia", "HT": "Haiti", "HU": "Hungary", "ID": "Indonesia", "IE": "Ireland",
    "IL": "Israel", "IN": "India", "IQ": "Iraq", "IR": "Iran", "IS": "Iceland", "IT": "Italy",
    "JM": "Jamaica", "JO": "Jordan", "JP": "Japan", "KE": "Kenya", "KG": "Kyrgyzstan", "KH": "Cambodia",
    "KI": "Kiribati", "KM": "Comoros", "KN": "Saint Kitts and Nevis", "KR": "South Korea", "KW": "Kuwait",
    "KY": "Cayman Islands", "KZ": "Kazakhstan", "LA": "Laos", "LB": "Lebanon", "LC": "Saint Lucia",
    "LI": "Liechtenstein", "LK": "Sri Lanka", "LR": "Liberia", "LS": "Lesotho", "LT": "Lithuania",
    "LU": "Luxembourg", "LV": "Latvia", "LY": "Libya", "MA": "Morocco", "MC": "Monaco", "MD": "Moldova",
    "ME": "Montenegro", "MG": "Madagascar", "MH": "Marshall Islands", "MK": "North Macedonia", "ML": "Mali",
    "MM": "Myanmar", "MN": "Mongolia", "MS": "Montserrat", "MT": "Malta", "MU": "Mauritius",
    "MV": "Maldives", "MW": "Malawi", "MX": "Mexico", "MY": "Malaysia", "MZ": "Mozambique", "NA": "Namibia",
    "NE": "Niger", "NG": "Nigeria", "NI": "Nicaragua", "NL": "Netherlands", "NO": "Norway", "NP": "Nepal",
    "NR": "Nauru", "NU": "Niue", "NZ": "New Zealand", "OM": "Oman", "PA": "Panama", "PE": "Peru",
    "PG": "Papua New Guinea", "PH": "Philippines", "PK": "Pakistan", "PL": "Poland", "PS": "Palestine",
    "PT": "Portugal", "PW": "Palau", "PY": "Paraguay", "QA": "Qatar", "RO": "Romania", "RS": "Serbia",
    "RU": "Russia", "RW": "Rwanda", "SA": "Saudi Arabia", "SB": "Solomon Islands", "SC": "Seychelles",
    "SD": "Sudan", "SE": "Sweden", "SG": "Singapore", "SI": "Slovenia", "SK": "Slovakia",
    "SL": "Sierra Leone", "SM": "San Marino", "SN": "Senegal", "SO": "Somalia", "SR": "Suriname",
    "SS": "South Sudan", "SV": "El Salvador", "SY": "Syria", "SZ": "Eswatini",
    "TC": "Turks and Caicos Islands", "TD": "Chad", "TG": "Togo", "TH": "Thailand", "TJ": "Tajikistan",
    "TL": "Timor-Leste", "TM": "Turkmenistan", "TN": "Tunisia", "TO": "Tonga", "TR": "Turkey",
    "TT": "Trinidad and Tobago", "TV": "Tuvalu", "TW": "Taiwan", "TZ": "Tanzania", "UA": "Ukraine",
    "UG": "Uganda", "US": "United States", "UY": "Uruguay", "UZ": "Uzbekistan", "VA": "Vatican City",
    "VC": "Saint Vincent and the Grenadines", "VE": "Venezuela", "VN": "Vietnam", "VU": "Vanuatu",
    "WS": "Samoa", "YE": "Yemen", "ZA": "South Africa", "ZM": "Zambia", "ZW": "Zimbabwe",
}  # fmt: skip


def country_name(code: str | None) -> str | None:
    if not code:
        return None
    return COUNTRY_NAMES.get(code.upper(), code.upper())
