function "Wallet/apply_debit" {
  input {
  }

  stack {
    db.transaction {
      stack {
        db.get wallet {
          field_name = "id"
          field_value = $input.id
        } as $fresh

        db.edit wallet {
          field_name = "id"
          field_value = $fresh.id
          data = {
            balance: $fresh.balance
          }
        } as $updated
      }
    }
  }

  response = $ok
}
