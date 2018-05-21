/* console.log is for the inspect page
  click on 'console' to see*/

console.log("Dog cat or elephant");


/*  'alert' is a pop-up when you load the page */

// alert("THIS IS NOT A DRILL");
// alert("DRILL")
// alert("Okay")
// alert("Okay")
// alert("Okay")
// alert("Okay")
// alert("5 more")
// alert("4 more")
// alert("3 more")
// alert("2 more")
// alert("1 more")

document.write("whatever text you want");

// document.write("14.03");

function listanimals() {
  console.log("Dog and a");
}

listanimals();
listanimals();
listanimals();
listanimals();


function square(num){
  return num * num;
}

function add(x, y){
  return x + y;
}

var sumofsquares = add(square(4), square(5));
console.log("Sum Of Squares:" + sumofsquares);


  var numberofdogs = 10;
  var numberofsharks = 1;
  var numberofanimals = numberofdogs + numberofsharks;

console.log(numberofdogs);
console.log(numberofanimals);

  var doubledogs = numberofdogs * 2;

console.log(doubledogs);

var topping = "Ham";
var topping2 = "Pineapple";
// var topping3 = "Extra cheeese";

var pizza = topping + " and " + topping2;

console.log(pizza);

function combinetoppings(topping, topping2,){
  var output = topping + " and " + topping2;
  console.log(output);
}


combinetoppings("Ham", "Pineapple", "Extra cheese");
combinetoppings("Chocolate", "Dark chocolate");
combinetoppings("Pepperoni", "Sausage");

var x = 1;
x = x + 1;

// shorthand for x = x + 1 below
// x += 1
// also works with *, /
