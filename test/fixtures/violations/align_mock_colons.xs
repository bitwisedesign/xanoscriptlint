function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
        "checkout short": {id: 1}
        "checkout longest_scenario_name": {id: 2}
      }
    }
  }

  response = $item
}