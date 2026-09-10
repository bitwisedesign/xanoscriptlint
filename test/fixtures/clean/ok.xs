// Clean example
function "example" {
  input {
    int page?=1
    decimal weight?=1
    int quantity?="-1"
    enum status {
      values = ["draft", "active"]
    }
    enum lane {
      values = [
        "northbound_express_lane"
        "southbound_express_lane"
        "local_collector_road"
      ]
    
    }
  }

  stack {
    var $ok {
      value = 1
    }
    db.query item {
      mock = {
        "checkout short"                : {id: 1}
        "checkout longest_scenario_name": {id: 2}
      }
    }
    function.run "Orders/dispatch" {
      input = {event_type: "manual", unit: "sets", delta: 3}
    } as $dispatch
    db.add job {
      data = {
        k: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }

  response = $ok
}