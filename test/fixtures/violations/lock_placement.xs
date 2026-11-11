function "example" {
  input {
  }

  stack {
    db.get seat_reservation {
      field_name = "seat_code"
      field_value = "absent"
      output = ["id", "seat_code", "hold_count"]
      lock = true
    } as $missing
  }

  response = $ok
}