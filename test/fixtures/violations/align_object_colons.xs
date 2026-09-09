function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {
        user_id: $input.user_id
        award_uuid: $input.award_uuid
        reason: $input.reason
      }
    } as $dispatch

    db.query item {
      mock = {
        "checkout short": {id: 1}
        "checkout longest_scenario_name": {id: 2}
      }
    }
  }

  response = $item
}