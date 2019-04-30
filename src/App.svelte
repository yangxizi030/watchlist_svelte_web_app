<script>
	import Watchlist from './Watchlist.svelte'
	let currentIdx = 0;
	const changeIdx = (index) => {
		currentIdx = index
	}

	let symbolList = [['AAPL', 'MSFT', 'SPX'], ['AAPL'], []];
  let nameList = ['Default Watchlist', 'AAPL Watchlist', 'Empty Watchlist']

	const addPage = () => {
		symbolList.push([])
		nameList.push('New Page')
		nameList = nameList
		symbolList = symbolList
	}
  const removePage = (i) => {
		symbolList.splice( i, 1 );
		nameList.splice( i, 1 );
		nameList = nameList
		symbolList = symbolList
	}
</script>

<style>
	ul {
  list-style-type: none;
  margin: 0;
  padding: 0;
  width: 25%;
  background-color: #f1f1f1;
  height: 100%;
  position: fixed;
  overflow: auto;
}
li {
  display: block;
  color: #000;
  padding: 20px 30px;
  text-decoration: none;
}
li:hover {
  background-color: #555;
  color: white;
}
.remove {
	width: 20px;
	height: 20px;
	margin: 10px 10px;
}
a {
	padding: 5px;
}
</style>

<ul>
	{#each nameList as name, i}
  <li on:click={e => changeIdx(i)}>
		{name}
		<a on:click={e => removePage(i)}>✘</a>
	</li>
  {/each}

	<li on:click={e => addPage()}>
		➕ Add Watchlist
	</li>
</ul>

<Watchlist symbols={symbolList[currentIdx]}/>
