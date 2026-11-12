function "Wallet/read_row" {
  input {
  }

  stack {
    db.get wallet {
      field_name = "id"
      field_value = $input.id
      lock = true
    } as $row
  }

  response = $ok
}
