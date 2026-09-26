import pandas as pd
import streamlit as st
from datetime import date

st.set_page_config(page_title="Tally — Budget & Expense Tracker", page_icon="💸", layout="wide")

CATEGORIES = [
    "Housing", "Food", "Transport", "Shopping",
    "Entertainment", "Utilities", "Health", "Other",
]

def money(value):
    return "$" + f"{value:,.0f}"

def seed_transactions():
    return pd.DataFrame([
        {"date": "2026-09-02", "merchant": "Salary", "category": "Other", "type": "Income", "amount": 3200.0},
        {"date": "2026-09-03", "merchant": "Rent", "category": "Housing", "type": "Expense", "amount": 900.0},
        {"date": "2026-09-06", "merchant": "Supermarket", "category": "Food", "type": "Expense", "amount": 145.0},
        {"date": "2026-09-10", "merchant": "Fuel", "category": "Transport", "type": "Expense", "amount": 65.0},
        {"date": "2026-09-13", "merchant": "Internet", "category": "Utilities", "type": "Expense", "amount": 42.0},
        {"date": "2026-09-18", "merchant": "Gym", "category": "Health", "type": "Expense", "amount": 35.0},
        {"date": "2026-09-22", "merchant": "Coffee", "category": "Food", "type": "Expense", "amount": 12.0},
    ])

def seed_budgets():
    return {
        "Housing": 1000.0,
        "Food": 350.0,
        "Transport": 180.0,
        "Utilities": 150.0,
        "Health": 120.0,
        "Shopping": 200.0,
        "Entertainment": 150.0,
        "Other": 150.0,
    }

def seed_goals():
    return pd.DataFrame([
        {"goal": "New laptop", "target": 1800.0, "saved": 720.0},
        {"goal": "Emergency fund", "target": 3000.0, "saved": 1350.0},
    ])

if "transactions" not in st.session_state:
    st.session_state.transactions = seed_transactions()
if "budgets" not in st.session_state:
    st.session_state.budgets = seed_budgets()
if "goals" not in st.session_state:
    st.session_state.goals = seed_goals()

st.title("Tally — Budget & Expense Tracker")
st.caption("Interactive Streamlit portfolio demo. Data is stored only for the current browser session.")

overview_tab, transactions_tab, budgets_tab, import_tab = st.tabs(
    ["Overview", "Transactions", "Budgets & Goals", "CSV Import"]
)

with overview_tab:
    tx = st.session_state.transactions.copy()
    expenses = tx[tx["type"] == "Expense"]
    income = tx.loc[tx["type"] == "Income", "amount"].sum()
    spent = expenses["amount"].sum()
    remaining = income - spent

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Income", money(income))
    c2.metric("Spent", money(spent))
    c3.metric("Remaining", money(remaining))
    c4.metric("Transactions", len(tx))

    st.subheader("Spending by category")
    if expenses.empty:
        st.info("No expenses yet.")
    else:
        by_category = (
            expenses.groupby("category", as_index=False)["amount"]
            .sum()
            .sort_values("amount", ascending=False)
        )
        st.bar_chart(by_category.set_index("category"))

    st.subheader("Recent transactions")
    st.dataframe(
        tx.sort_values("date", ascending=False).head(8),
        use_container_width=True,
        hide_index=True,
    )

with transactions_tab:
    st.subheader("Add transaction")
    with st.form("transaction_form", clear_on_submit=True):
        c1, c2 = st.columns(2)
        merchant = c1.text_input("Merchant / source")
        amount = c2.number_input("Amount", min_value=0.0, step=1.0)

        c3, c4, c5 = st.columns(3)
        category = c3.selectbox("Category", CATEGORIES)
        tx_type = c4.selectbox("Type", ["Expense", "Income"])
        tx_date = c5.date_input("Date", value=date.today())

        submitted = st.form_submit_button("Add transaction")
        if submitted:
            if not merchant.strip() or amount <= 0:
                st.warning("Enter a merchant/source and an amount greater than zero.")
            else:
                new_row = pd.DataFrame([{
                    "date": tx_date.isoformat(),
                    "merchant": merchant.strip(),
                    "category": category,
                    "type": tx_type,
                    "amount": float(amount),
                }])
                st.session_state.transactions = pd.concat(
                    [st.session_state.transactions, new_row], ignore_index=True
                )
                st.success("Transaction added.")
                st.rerun()

    st.subheader("All transactions")
    search = st.text_input("Search")
    data = st.session_state.transactions.copy()
    if search:
        mask = (
            data["merchant"].str.contains(search, case=False, na=False)
            | data["category"].str.contains(search, case=False, na=False)
        )
        data = data[mask]

    st.dataframe(
        data.sort_values("date", ascending=False),
        use_container_width=True,
        hide_index=True,
    )

with budgets_tab:
    st.subheader("Monthly budgets")
    expenses = st.session_state.transactions[
        st.session_state.transactions["type"] == "Expense"
    ]

    for category, limit in st.session_state.budgets.items():
        spent = float(expenses.loc[expenses["category"] == category, "amount"].sum())
        pct = 0 if limit <= 0 else min(100, int(spent / limit * 100))
        st.write(f"**{category}** — {money(spent)} of {money(limit)}")
        st.progress(pct)

    st.divider()
    st.subheader("Savings goals")
    for _, row in st.session_state.goals.iterrows():
        pct = min(100, int(row["saved"] / row["target"] * 100))
        st.write(f"**{row['goal']}** — {money(row['saved'])} / {money(row['target'])}")
        st.progress(pct)

with import_tab:
    st.subheader("Import transactions from CSV")
    st.write("Upload a CSV with columns: date, merchant, category, type, amount.")
    uploaded = st.file_uploader("Choose CSV", type=["csv"])

    if uploaded is not None:
        try:
            imported = pd.read_csv(uploaded)
            required = {"date", "merchant", "category", "type", "amount"}
            missing = required - set(imported.columns)

            if missing:
                st.error("Missing required columns: " + ", ".join(sorted(missing)))
            else:
                st.dataframe(imported.head(20), use_container_width=True)
                if st.button("Import rows"):
                    clean = imported[
                        ["date", "merchant", "category", "type", "amount"]
                    ].copy()
                    clean["amount"] = pd.to_numeric(clean["amount"], errors="coerce")
                    clean = clean.dropna(subset=["amount"])
                    clean = clean[clean["amount"] > 0]
                    st.session_state.transactions = pd.concat(
                        [st.session_state.transactions, clean], ignore_index=True
                    )
                    st.success(f"Imported {len(clean)} transactions.")
                    st.rerun()
        except Exception as exc:
            st.error(f"Could not read the CSV: {exc}")

st.divider()
st.caption(
    "Portfolio demo of Tally. The main React/TypeScript project includes "
    "Supabase authentication, persistent data, admin tools and AI-assisted receipt extraction."
)
