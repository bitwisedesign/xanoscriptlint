table shelf {
  auth = false

  schema {
    int id

    // Stable shelf code
    uuid shelf_uuid

    text label
  }
}

function "example" {
  input {
  }

  stack {
    function.run "Orders/lookup" {
      input = {order_id: $input.id}
    } as $order

    var $known {
      value = false
    }
    foreach ($picked
      |get:"sku_ids"
      |first_notnull:[]) {
      each as $sku {
        var $ok {
          value = $sku
        }
      }
    }
    db.query cart {
      where = $db.cart.id == $input.id
      return = {type: "list"}
    } as $rows
    api.request {
      url = "https://example.test"
      headers = []
        |push:"Content-Type: application/json"

      timeout = 30
    } as $sent
    db.query item {
      mock = {
        "checkout short": {id: 1}

        "checkout long": {id: 2}
      }
    } as $item
    var $prompt {
      value = """
        Translate.

        Keep this gap.
        """
    }
    var $note {
      value = ```
        {id: 1}

        {id: 2}
        ```
    }
  }

  response = $rows

  test "lookup returns the open cart" {
    input = {order_id: 7}

    expect.to_be_true ($response.known)
  }
}
