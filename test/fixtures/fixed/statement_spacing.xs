function "example" {
  input {
    int id
    text[]? locales?
    uuid order_uuid
    enum status {
      values = ["open", "paid"]
    }
    int? owner_id?
    json? detail?
    object parcel {
      schema {
        decimal? cost?
        int? packed_by? {
          table = "user"
        }
      }
    }
  }

  stack {
    function.run "Orders/lookup" as $order
    var $known {
      value = false
    }
    conditional {
      if ($known) {
        function.run "Orders/apply_tax" as $tax
        var $note {
          value = null
        }
      }
    }
    db.query cart {
      where = $db.cart.id == $input.id
      return = {type: "list"}
    } as $rows
  }

  response = $rows
}
